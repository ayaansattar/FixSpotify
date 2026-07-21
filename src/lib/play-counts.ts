import { db } from "@/lib/db";

export type CountableTrack = {
  id: string;
  name: string;
  artistIds: string[];
  artistNames: string[];
};

/**
 * Counts plays for playlist tracks. Spotify assigns different IDs to the same
 * song across album releases, so a direct ID match alone undercounts. After
 * counting by ID, we merge plays from other IDs whose normalized title and
 * artist match the playlist track.
 */
export async function getPlayCounts(
  tracks: CountableTrack[],
  since: Date | null,
) {
  const countByTrack = new Map<string, number>();
  const chunkSize = 500;
  const trackIds = tracks.map((track) => track.id);
  const playlistIdSet = new Set(trackIds);

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

  // Alias buckets: plays under IDs that are not in this playlist, keyed by a
  // soft-normalized title so remasters still match the playlist version.
  // Loaded in memory (instead of SQL notIn) because large playlists exceed
  // SQLite's parameter limit.
  const aliasBuckets = new Map<
    string,
    Array<{
      artistId: string;
      artistName: string;
      count: number;
    }>
  >();

  const groups = await db.play.groupBy({
    by: ["trackName", "trackId", "artistId", "artistName"],
    where: since ? { playedAt: { gte: since } } : {},
    _count: { _all: true },
  });

  for (const group of groups) {
    if (playlistIdSet.has(group.trackId)) {
      continue;
    }

    const key = softNormalizeTitle(group.trackName);

    if (!key) {
      continue;
    }

    const entries = aliasBuckets.get(key) ?? [];
    entries.push({
      artistId: group.artistId,
      artistName: group.artistName,
      count: group._count._all,
    });
    aliasBuckets.set(key, entries);
  }

  for (const track of tracks) {
    const direct = countByTrack.get(track.id) ?? 0;
    const key = softNormalizeTitle(track.name);
    const candidates = key ? (aliasBuckets.get(key) ?? []) : [];
    const aliasTotal = candidates
      .filter((candidate) =>
        artistsMatch(candidate, track.artistIds, track.artistNames),
      )
      .reduce((sum, candidate) => sum + candidate.count, 0);

    countByTrack.set(track.id, direct + aliasTotal);
  }

  return countByTrack;
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
    // No trustworthy artist identity — refuse to merge by title alone.
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
