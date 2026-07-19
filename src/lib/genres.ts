import { db } from "@/lib/db";
import { lookupArtistGenres } from "@/lib/musicbrainz";

/**
 * MusicBrainz allows ~1 request/second, so a large playlist can't be resolved
 * in one page load. Each load fetches up to this many uncached artists; the
 * rest resolve on subsequent visits. Results cache indefinitely in GenreCache.
 */
const MAX_LOOKUPS_PER_LOAD = 30;

export type ArtistRef = {
  id: string;
  name: string;
};

export type GenreLookupResult = {
  genresByArtist: Map<string, string[]>;
  /** Artists still missing genre data because of the per-load lookup cap. */
  pendingArtists: number;
};

/**
 * Resolves genre tags for the given artists. Spotify removed genre data from
 * its API for development-mode apps (February 2026), so genres come from
 * MusicBrainz, matched by artist name and cached by Spotify artist id.
 */
export async function getGenresForArtists(
  artists: ArtistRef[],
): Promise<GenreLookupResult> {
  const uniqueArtists = Array.from(
    new Map(
      artists
        .filter((artist) => artist.id && artist.name)
        .map((artist) => [artist.id, artist]),
    ).values(),
  );
  const genresByArtist = new Map<string, string[]>();

  // SQLite limits query parameters, so read the cache in chunks.
  const chunkSize = 500;

  for (let i = 0; i < uniqueArtists.length; i += chunkSize) {
    const chunk = uniqueArtists.slice(i, i + chunkSize);
    const cached = await db.genreCache.findMany({
      where: { artistId: { in: chunk.map((artist) => artist.id) } },
    });

    for (const entry of cached) {
      genresByArtist.set(entry.artistId, parseGenres(entry.genres));
    }
  }

  const missing = uniqueArtists.filter(
    (artist) => !genresByArtist.has(artist.id),
  );
  const toLookUp = missing.slice(0, MAX_LOOKUPS_PER_LOAD);
  const rows: Array<{ artistId: string; genres: string }> = [];

  for (const artist of toLookUp) {
    const genres = await lookupArtistGenres(artist.name);

    if (genres === null) {
      // Lookup failed (network/rate limit); leave uncached to retry later.
      continue;
    }

    genresByArtist.set(artist.id, genres);
    rows.push({ artistId: artist.id, genres: JSON.stringify(genres) });
  }

  if (rows.length > 0) {
    await db.genreCache.createMany({ data: rows });
  }

  return {
    genresByArtist,
    pendingArtists: uniqueArtists.length - genresByArtist.size,
  };
}

function parseGenres(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((genre): genre is string => typeof genre === "string")
      : [];
  } catch {
    return [];
  }
}

/** Generic words in playlist names that say nothing about genre. */
const NAME_STOPWORDS = new Set([
  "the",
  "and",
  "my",
  "mix",
  "list",
  "playlist",
  "songs",
  "song",
  "tracks",
  "track",
  "music",
  "vibes",
  "best",
  "top",
  "new",
  "old",
  "favorites",
  "favourites",
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Light stemming so "classics" matches "classic", "oldies" ~ "oldie". */
function stem(token: string): string {
  return token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token;
}

function meaningfulTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(" ")
      .filter((token) => token.length > 1 && !NAME_STOPWORDS.has(token))
      .map(stem),
  );
}

/**
 * Scores how well a track's genres fit a playlist name. Returns 0 when there
 * is no overlap and up to 1 for an exact genre/name match.
 */
export function scorePlaylistMatch(
  genres: string[],
  playlistName: string,
): number {
  const name = normalize(playlistName);
  const nameTokens = meaningfulTokens(playlistName);

  if (!name || nameTokens.size === 0) {
    return 0;
  }

  let best = 0;

  for (const genre of genres) {
    const normalizedGenre = normalize(genre);

    if (!normalizedGenre) {
      continue;
    }

    if (normalizedGenre === name) {
      return 1;
    }

    if (
      name.includes(normalizedGenre) ||
      normalizedGenre.includes(name)
    ) {
      best = Math.max(best, 0.9);
      continue;
    }

    const genreTokens = normalizedGenre.split(" ").map(stem);
    const overlap = genreTokens.filter((token) =>
      nameTokens.has(token),
    ).length;

    if (overlap > 0) {
      // Full token containment ("indie folk" in "Folk") beats partial overlap.
      best = Math.max(best, 0.5 + 0.4 * (overlap / genreTokens.length));
    }
  }

  return best;
}

export type PlaylistSuggestion = {
  playlistId: string;
  playlistName: string;
  score: number;
};

/** Minimum score before a playlist counts as a genre match. */
export const MATCH_THRESHOLD = 0.5;

export function suggestPlaylist(
  genres: string[],
  playlists: Array<{ id: string; name: string }>,
): PlaylistSuggestion | null {
  let best: PlaylistSuggestion | null = null;

  for (const playlist of playlists) {
    const score = scorePlaylistMatch(genres, playlist.name);

    if (score >= MATCH_THRESHOLD && (!best || score > best.score)) {
      best = {
        playlistId: playlist.id,
        playlistName: playlist.name,
        score,
      };
    }
  }

  return best;
}
