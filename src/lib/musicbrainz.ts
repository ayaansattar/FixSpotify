const MUSICBRAINZ_API = "https://musicbrainz.org/ws/2";

// MusicBrainz requires a descriptive User-Agent and allows ~1 request/second.
const USER_AGENT = "FixSpotify/1.0 (https://github.com/ayaansattar/FixSpotify)";
const REQUEST_INTERVAL_MS = 1_100;

/** Minimum search score (0-100) before we trust the artist name match. */
const MIN_MATCH_SCORE = 85;

type ArtistSearchResponse = {
  artists?: Array<{
    id: string;
    name: string;
    score?: number;
    tags?: Array<{ count?: number; name?: string }>;
  }>;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastRequestAt = 0;

async function rateLimitedFetch(url: string) {
  const wait = lastRequestAt + REQUEST_INTERVAL_MS - Date.now();

  if (wait > 0) {
    await sleep(wait);
  }

  lastRequestAt = Date.now();

  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });
}

/**
 * Looks up an artist's genre tags on MusicBrainz by name. Returns null when
 * the request fails (so callers can retry later) and an empty array when the
 * artist genuinely has no usable match or tags (safe to cache).
 */
export async function lookupArtistGenres(
  artistName: string,
): Promise<string[] | null> {
  const query = encodeURIComponent(`artist:"${artistName.replaceAll('"', "")}"`);

  try {
    const response = await rateLimitedFetch(
      `${MUSICBRAINZ_API}/artist?query=${query}&limit=1&fmt=json`,
    );

    if (response.status === 503) {
      // Rate limited; let the caller retry on a later page load.
      return null;
    }

    if (!response.ok) {
      return null;
    }

    const body = (await response.json()) as ArtistSearchResponse;
    const match = body.artists?.[0];

    if (!match || (match.score ?? 0) < MIN_MATCH_SCORE) {
      return [];
    }

    const tags = (match.tags ?? [])
      .filter((tag) => (tag.count ?? 0) > 0 && tag.name)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
      .slice(0, 8)
      .map((tag) => tag.name!.toLowerCase());

    return tags;
  } catch {
    return null;
  }
}
