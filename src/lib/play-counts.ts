import { db } from "@/lib/db";
import { ensureTrackMeta } from "@/lib/track-meta";

export type CountableTrack = {
  id: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
};

type PlayGroup = {
  trackId: string;
  trackName: string;
  artistId: string;
  artistName: string;
  count: number;
};

/**
 * Counts plays for playlist tracks. Spotify assigns different IDs to the same
 * recording across locales/releases (e.g. Arabic "قيام" vs Latin "Qeiam"), so
 * counting by playlist track ID alone undercounts. Matching order:
 * 1) exact track ID
 * 2) soft-normalized title + artist
 * 3) shared ISRC (when an access token is provided)
 */
export async function getPlayCounts(
  tracks: CountableTrack[],
  since: Date | null,
  accessToken?: string | null,
) {
  const countByTrack = new Map<string, number>();
  const countedPlayIds = new Map<string, Set<string>>();
  const chunkSize = 500;
  const trackIds = tracks.map((track) => track.id);
  const playlistIdSet = new Set(trackIds);

  for (const track of tracks) {
    countedPlayIds.set(track.id, new Set([track.id]));
  }

  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const playCounts = await db.play.groupBy({
      by: ["trackId"],
      where: {
        trackId: { in: chunk },
        ...(since ? { playedAt: { gte: since } } : {}),
      },
      _count: { _all: true },
    });

    for (const play of playCounts) {
      countByTrack.set(play.trackId, play._count._all);
    }
  }

  for (const track of tracks) {
    if (!countByTrack.has(track.id)) {
      countByTrack.set(track.id, 0);
    }
  }

  const groups: PlayGroup[] = (
    await db.play.groupBy({
      by: ["trackName", "trackId", "artistId", "artistName"],
      where: since ? { playedAt: { gte: since } } : {},
      _count: { _all: true },
    })
  ).map((group) => ({
    trackId: group.trackId,
    trackName: group.trackName,
    artistId: group.artistId,
    artistName: group.artistName,
    count: group._count._all,
  }));

  const outsideGroups = groups.filter(
    (group) => !playlistIdSet.has(group.trackId),
  );

  // Soft-title + artist aliases.
  const aliasBuckets = new Map<string, PlayGroup[]>();

  for (const group of outsideGroups) {
    const key = softNormalizeTitle(group.trackName);

    if (!key) {
      continue;
    }

    const entries = aliasBuckets.get(key) ?? [];
    entries.push(group);
    aliasBuckets.set(key, entries);
  }

  for (const track of tracks) {
    const key = softNormalizeTitle(track.name);
    const candidates = key ? (aliasBuckets.get(key) ?? []) : [];
    const counted = countedPlayIds.get(track.id)!;
    let extra = 0;

    for (const candidate of candidates) {
      if (counted.has(candidate.trackId)) {
        continue;
      }

      if (!artistsMatch(candidate, track.artistIds, track.artistNames)) {
        continue;
      }

      counted.add(candidate.trackId);
      extra += candidate.count;
    }

    countByTrack.set(track.id, (countByTrack.get(track.id) ?? 0) + extra);
  }

  if (!accessToken) {
    return countByTrack;
  }

  // ISRC aliases: same recording, different Spotify IDs / localized titles.
  await mergeIsrcAliases(
    accessToken,
    tracks,
    outsideGroups,
    countByTrack,
    countedPlayIds,
  );

  return countByTrack;
}

async function mergeIsrcAliases(
  accessToken: string,
  tracks: CountableTrack[],
  outsideGroups: PlayGroup[],
  countByTrack: Map<string, number>,
  countedPlayIds: Map<string, Set<string>>,
) {
  // Prefer fixing never-played tracks first, then the rest.
  const orderedTracks = [...tracks].sort(
    (a, b) => (countByTrack.get(a.id) ?? 0) - (countByTrack.get(b.id) ?? 0),
  );

  const playlistIdsToResolve: string[] = [];
  const candidateIds = new Set<string>();
  const MAX_FETCHES = 80;

  for (const track of orderedTracks) {
    if (playlistIdsToResolve.length + candidateIds.size >= MAX_FETCHES) {
      break;
    }

    const counted = countedPlayIds.get(track.id)!;
    let addedForTrack = 0;

    for (const group of outsideGroups) {
      if (
        addedForTrack >= 8 ||
        playlistIdsToResolve.length + candidateIds.size >= MAX_FETCHES
      ) {
        break;
      }

      if (counted.has(group.trackId) || candidateIds.has(group.trackId)) {
        continue;
      }

      if (artistsMatch(group, track.artistIds, track.artistNames)) {
        candidateIds.add(group.trackId);
        addedForTrack += 1;
      }
    }

    if (addedForTrack > 0) {
      playlistIdsToResolve.push(track.id);
    }
  }

  if (playlistIdsToResolve.length === 0 || candidateIds.size === 0) {
    return;
  }

  const playlistMeta = await ensureTrackMeta(accessToken, playlistIdsToResolve);
  const candidateMeta = await ensureTrackMeta(
    accessToken,
    Array.from(candidateIds),
  );

  const countsByIsrc = new Map<string, Array<{ trackId: string; count: number }>>();

  for (const group of outsideGroups) {
    const isrc = candidateMeta.get(group.trackId)?.isrc;

    if (!isrc) {
      continue;
    }

    const entries = countsByIsrc.get(isrc) ?? [];
    entries.push({ trackId: group.trackId, count: group.count });
    countsByIsrc.set(isrc, entries);
  }

  for (const track of tracks) {
    const isrc = playlistMeta.get(track.id)?.isrc;

    if (!isrc) {
      continue;
    }

    const counted = countedPlayIds.get(track.id)!;
    let extra = 0;

    for (const entry of countsByIsrc.get(isrc) ?? []) {
      if (counted.has(entry.trackId)) {
        continue;
      }

      counted.add(entry.trackId);
      extra += entry.count;
    }

    if (extra > 0) {
      countByTrack.set(track.id, (countByTrack.get(track.id) ?? 0) + extra);
    }
  }
}

function artistsMatch(
  play: { artistId: string; artistName: string },
  artistIds: string[],
  artistNames: string[],
) {
  if (play.artistId && play.artistId !== "unknown") {
    if (artistIds.includes(play.artistId)) {
      return true;
    }
  }

  const playArtist = softNormalizeArtist(play.artistName);

  if (!playArtist) {
    return false;
  }

  return artistNames.some((name) => {
    const playlistArtist = softNormalizeArtist(name);

    if (!playlistArtist) {
      return false;
    }

    return (
      playlistArtist === playArtist ||
      playlistArtist.includes(playArtist) ||
      playArtist.includes(playlistArtist)
    );
  });
}

/** Keep letters from any script; strip punctuation and collapse whitespace. */
export function normalizeTitle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Soft title key used for alias matching. Strips remaster / featuring tags so
 * "Song - Remastered" matches "Song", but leaves Remix/Live intact so those
 * remain separate recordings.
 */
export function softNormalizeTitle(name: string) {
  return normalizeTitle(name)
    .replace(
      /\b(remaster(?:ed)?|deluxe(?: edition)?|radio edit|feat(?:uring)?|ft)\b/gu,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function softNormalizeArtist(name: string) {
  return normalizeTitle(name)
    .replace(/\b(feat(?:uring)?|ft|with)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
