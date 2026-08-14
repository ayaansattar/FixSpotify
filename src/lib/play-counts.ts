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

/** One Spotify track ID may appear as multiple Play groups after artist backfills. */
type AggregatedPlay = {
  trackId: string;
  trackName: string;
  count: number;
  variants: PlayGroup[];
};

/**
 * Counts plays for playlist tracks. Spotify assigns different IDs to the same
 * recording across locales/releases (e.g. Arabic "قيام" vs Latin "Qeiam"), so
 * counting by playlist track ID alone undercounts. Matching order:
 * 1) exact track ID
 * 2) soft title (release metadata stripped; mashup "A x B" / "B x A"
 *    treated as the same; a shorter title may match inside a longer one
 *    only when extra words wrap it, e.g. "Humsafar" inside "Wo Humsafar
 *    Tha"; close typos allowed) + artist (including initials like "QB"
 *    for "Quratulain Balouch"), or title alone when the soft title is
 *    distinctive enough. Remix, burnt, and similar arrangement labels stay.
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

  // Soft-title aliases. Include other playlist track IDs too, so
  // "Take on Me" and "Take on Me - MTV Unplugged" on the same playlist share
  // play history when their soft titles match. Mashups named
  // "I'll Do It x Ayesha" vs "Ayesha X i'll do it" share a canonical key.
  // Remixes, burnt cuts, and other arrangement suffixes stay distinct
  // from the original vocal. A shorter title may only match inside a
  // longer one when it is wrapped by extra words ("Humsafar" inside
  // "Wo Humsafar Tha"), not when the extra words are a trailing version
  // ("I Like the Way You Kiss Me - burnt").
  //
  // Aggregate by trackId first: artist backfills can split one ID across
  // several groupBy rows; matching only the first row undercounted the rest.
  const aggregatedPlays = aggregateByTrackId(groups);
  const aliasBuckets = new Map<string, AggregatedPlay[]>();

  for (const play of aggregatedPlays) {
    const key = softTitleKey(play.trackName);

    if (!key) {
      continue;
    }

    const entries = aliasBuckets.get(key) ?? [];
    entries.push(play);
    aliasBuckets.set(key, entries);
  }

  const aliasKeys = Array.from(aliasBuckets.keys());

  for (const track of tracks) {
    const key = softTitleKey(track.name);
    if (!key) {
      continue;
    }

    const matchedKeys = aliasKeys.filter((candidateKey) =>
      titlesLooselyMatch(key, candidateKey),
    );
    const counted = countedPlayIds.get(track.id)!;
    let extra = 0;

    for (const matchedKey of matchedKeys) {
      const candidates = aliasBuckets.get(matchedKey) ?? [];
      for (const candidate of candidates) {
        if (counted.has(candidate.trackId)) {
          continue;
        }

        const artistOk = candidate.variants.some((variant) =>
          artistsMatch(variant, track.artistIds, track.artistNames),
        );
        if (!artistOk && !isDistinctiveTitle(key)) {
          continue;
        }

        counted.add(candidate.trackId);
        extra += candidate.count;
      }
    }

    countByTrack.set(track.id, (countByTrack.get(track.id) ?? 0) + extra);
  }

  if (!accessToken) {
    return countByTrack;
  }

  // ISRC aliases: same recording, different Spotify IDs / localized titles.
  const outsideGroups = groups.filter(
    (group) => !playlistIdSet.has(group.trackId),
  );
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
  // Always finish never-played tracks first so localized titles (Qeiam/قيام)
  // aren't starved by later ISRC lookups on large playlists.
  const orderedTracks = [...tracks].sort((a, b) => {
    const aCount = countByTrack.get(a.id) ?? 0;
    const bCount = countByTrack.get(b.id) ?? 0;
    if (aCount === 0 && bCount !== 0) return -1;
    if (bCount === 0 && aCount !== 0) return 1;
    return aCount - bCount;
  });

  const playlistIdsToResolve: string[] = [];
  const candidateIds = new Set<string>();
  const MAX_FETCHES = 120;

  for (const track of orderedTracks) {
    const remaining = MAX_FETCHES - (playlistIdsToResolve.length + candidateIds.size);
    if (remaining <= 1) {
      break;
    }

    const counted = countedPlayIds.get(track.id)!;
    let addedForTrack = 0;
    const perTrackBudget = trackCountIsZero(countByTrack, track.id) ? 12 : 4;

    for (const group of outsideGroups) {
      if (
        addedForTrack >= perTrackBudget ||
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
    const existing = entries.find((entry) => entry.trackId === group.trackId);
    if (existing) {
      existing.count += group.count;
    } else {
      entries.push({ trackId: group.trackId, count: group.count });
    }
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

function trackCountIsZero(
  countByTrack: Map<string, number>,
  trackId: string,
) {
  return (countByTrack.get(trackId) ?? 0) === 0;
}

function aggregateByTrackId(groups: PlayGroup[]): AggregatedPlay[] {
  const byTrackId = new Map<string, AggregatedPlay>();

  for (const group of groups) {
    const existing = byTrackId.get(group.trackId);

    if (!existing) {
      byTrackId.set(group.trackId, {
        trackId: group.trackId,
        trackName: group.trackName,
        count: group.count,
        variants: [group],
      });
      continue;
    }

    existing.count += group.count;
    existing.variants.push(group);

    // Prefer a populated artist row's title when the first variant is sparse.
    if (
      (!existing.trackName || softTitleKey(existing.trackName) === "") &&
      softTitleKey(group.trackName)
    ) {
      existing.trackName = group.trackName;
    }
  }

  return Array.from(byTrackId.values());
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
      playArtist.includes(playlistArtist) ||
      artistInitialsMatch(playArtist, playlistArtist)
    );
  });
}

/** Keep letters from any script; strip punctuation and collapse whitespace. */
function normalizeTitle(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * Soft title key used for alias matching. Strips remaster / live / unplugged /
 * featuring tags, soundtrack "From …" suffixes, and common viral-edit labels
 * (slowed/reverb/sped up) so alternate uploads of the same song share
 * play history. Remix / instrumental markers are intentionally kept so those
 * stay separate from the original vocal.
 */
function softNormalizeTitle(name: string) {
  const withoutSoundtrack = name
    // "Dooriyan (From "Love Aaj Kal")" / "Jugni (from "Cocktail")"
    .replace(/\(\s*from\b[^)]*\)/gi, " ")
    // "Woh Lamhe Woh Baatein - From "Zeher""
    .replace(/\s*[-\u2013\u2014]\s*from\b.*$/gi, " ")
    // "Kalabaaz Dil from 'Lahore Se Aagey'"
    .replace(/\s+from\s+['\u2018\u2019\u201c\u201d"].*$/gi, " ")
    // Featured / guest artist clauses (order and "with" vs "feat" vary).
    // "Girls (feat. Cardi B, Bebe Rexha & Charli XCX)"
    // "luther (with sza)"
    .replace(/\([^)]*\bfeat(?:uring)?\.?[^)]*\)/gi, " ")
    .replace(/\([^)]*\bft\.?[^)]*\)/gi, " ")
    .replace(/\([^)]*\bwith\b[^)]*\)/gi, " ")
    .replace(/\s*[-\u2013\u2014]\s*feat(?:uring)?\.?\s+.+$/gi, " ")
    .replace(/\s*[-\u2013\u2014]\s*ft\.?\s+.+$/gi, " ")
    .replace(/\s*[-\u2013\u2014]\s*with\s+.+$/gi, " ")
    .replace(/\s+feat(?:uring)?\.?\s+.+$/gi, " ")
    .replace(/\s+ft\.?\s+.+$/gi, " ");

  return normalizeTitle(withoutSoundtrack)
    .replace(
      /\b(remaster(?:ed)?|deluxe(?: edition)?|radio edit|radio version|mtv unplugged|unplugged|summer solstice|acoustic(?: version)?|live(?: version)?|mono|stereo|feat(?:uring)?|ft)\b/gu,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias key that also collapses remaster years and common release
 *  qualifiers (single / album / original / soundtrack / season).
 *  Mashup halves around a standalone "x" are sorted so "A x B" and "B x A"
 *  share a key. Remix, instrumental, burnt, slowed, and similar arrangement
 *  labels are kept so those recordings stay distinct from the original. */
function softTitleKey(name: string) {
  const key = softNormalizeTitle(name)
    // "Personal Jesus - Original Single Version" vs "Personal Jesus - Single Version"
    // "Suno Chanda - Original Soundtrack" vs "Suno Chanda Season 2"
    .replace(/\b(original|single|album|extended|soundtrack|ost)\b/gu, " ")
    .replace(/\bseason\s*\d+\b/gu, " ")
    // "Kashmir - 1990 Remaster" vs "Kashmir - Remaster"
    .replace(/\b((?:19|20)\d{2})\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return canonicalizeMashupKey(key);
}

/** "I'll Do It x Ayesha" and "Ayesha X i'll do it" → "ayesha x i ll do it". */
function canonicalizeMashupKey(key: string) {
  const parts = key
    .split(/\bx\b/g)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return key;
  }

  return [...parts].sort((a, b) => a.localeCompare(b)).join(" x ");
}

function isDistinctiveTitle(key: string) {
  const tokens = key.split(" ").filter(Boolean);
  // 11 letters lets "suno chanda" merge viral uploads without an artist
  // match; 2-word titles like "love story" (10) still need an artist.
  return key.length >= 11 && tokens.length >= 2;
}

function titlesLooselyMatch(a: string, b: string) {
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }
  // "Humsafar" vs "Wo Humsafar Tha" (wrapped). Do not treat a title as
  // matching its own remix/burnt/mashup suffix or prefix.
  if (titleTokensWrapped(a, b) || titleTokensWrapped(b, a)) {
    return true;
  }
  if (Math.min(a.length, b.length) < 10) {
    return false;
  }
  return levenshtein(a, b) <= 1;
}

/**
 * True when `needle` appears as a contiguous run in `haystack` with extra
 * tokens both before and after it. That matches grammatical wrapping
 * ("wo humsafar tha") but not version suffixes ("… kiss me burnt") or
 * mashup halves ("better off alone x … kiss me").
 */
function titleTokensWrapped(needle: string, haystack: string) {
  if (needle.length < 8) {
    return false;
  }

  const needleTokens = needle.split(" ").filter(Boolean);
  const haystackTokens = haystack.split(" ").filter(Boolean);

  if (
    needleTokens.length === 0 ||
    needleTokens.length + 2 > haystackTokens.length
  ) {
    return false;
  }

  for (let i = 1; i <= haystackTokens.length - needleTokens.length - 1; i += 1) {
    if (needleTokens.every((token, j) => haystackTokens[i + j] === token)) {
      return true;
    }
  }

  return false;
}

/**
 * "QB" matches "Quratulain Balouch": a 2–4 letter name vs initials of a
 * longer multi-word name. Each expanded word must be 5+ letters so short
 * stage names like "KK" do not match "Kailash Kher".
 */
function artistInitialsMatch(a: string, b: string) {
  const compactA = compactArtistInitials(a);
  const compactB = compactArtistInitials(b);
  const expandedA = expandedArtistInitials(a);
  const expandedB = expandedArtistInitials(b);

  return Boolean(
    (compactA && expandedB && compactA === expandedB) ||
      (compactB && expandedA && compactB === expandedA),
  );
}

function compactArtistInitials(name: string) {
  const tokens = name.split(" ").filter(Boolean);
  if (tokens.length === 1 && /^[a-z]{2,4}$/.test(tokens[0]!)) {
    return tokens[0];
  }
  return null;
}

function expandedArtistInitials(name: string) {
  const tokens = name.split(" ").filter(Boolean);
  if (tokens.length < 2 || tokens.some((token) => token.length < 5)) {
    return null;
  }
  return tokens.map((token) => token[0]).join("");
}

function levenshtein(a: string, b: string) {
  if (a === b) {
    return 0;
  }
  if (Math.abs(a.length - b.length) > 1) {
    return 2;
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => 0),
  );

  for (let i = 0; i < rows; i += 1) {
    matrix[i]![0] = i;
  }
  for (let j = 0; j < cols; j += 1) {
    matrix[0]![j] = j;
  }

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i]![j] = Math.min(
        matrix[i - 1]![j]! + 1,
        matrix[i]![j - 1]! + 1,
        matrix[i - 1]![j - 1]! + cost,
      );
    }
  }

  return matrix[a.length]![b.length]!;
}

function softNormalizeArtist(name: string) {
  return normalizeTitle(name)
    .replace(/\b(feat(?:uring)?|ft|with)\b/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
