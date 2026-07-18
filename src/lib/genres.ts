import { db } from "@/lib/db";
import { getSpotifyArtists } from "@/lib/spotify";

/**
 * Resolves genres for the given artists, reading from the GenreCache table
 * first and only asking Spotify for artists we have never seen. Genres for an
 * artist essentially never change, so cached entries are kept indefinitely.
 */
export async function getGenresForArtists(
  accessToken: string,
  artistIds: string[],
): Promise<Map<string, string[]>> {
  const uniqueIds = Array.from(new Set(artistIds.filter(Boolean)));
  const genresByArtist = new Map<string, string[]>();

  // SQLite limits query parameters, so read the cache in chunks.
  const chunkSize = 500;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const cached = await db.genreCache.findMany({
      where: { artistId: { in: chunk } },
    });

    for (const entry of cached) {
      genresByArtist.set(entry.artistId, parseGenres(entry.genres));
    }
  }

  const missingIds = uniqueIds.filter((id) => !genresByArtist.has(id));

  if (missingIds.length > 0) {
    const artists = await getSpotifyArtists(accessToken, missingIds);
    const fetchedIds = new Set<string>();

    for (const artist of artists) {
      genresByArtist.set(artist.id, artist.genres ?? []);
      fetchedIds.add(artist.id);
    }

    // Cache artists Spotify didn't return (deleted/local) as empty too, so we
    // don't re-request them on every page load.
    const rows = missingIds.map((artistId) => ({
      artistId,
      genres: JSON.stringify(
        fetchedIds.has(artistId) ? (genresByArtist.get(artistId) ?? []) : [],
      ),
    }));

    for (const artistId of missingIds) {
      if (!genresByArtist.has(artistId)) {
        genresByArtist.set(artistId, []);
      }
    }

    await db.genreCache.createMany({ data: rows });
  }

  return genresByArtist;
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
