import { db } from "@/lib/db";
import { getPlaylistTracks, type SpotifyPlaylistTrack } from "@/lib/spotify";

/**
 * How long a cached playlist track list is considered fresh. Large playlists
 * cost ~1 Spotify request per 50 tracks, so caching avoids re-fetching all
 * pages on every dashboard/shuffle load and keeps us under the rate limit.
 * Mutations (remove/restore) invalidate the entry and the dashboard Refresh
 * button forces a fetch, so this TTL only affects changes made in the Spotify
 * client outside this app.
 */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function isTrack(value: unknown): value is SpotifyPlaylistTrack {
  if (!value || typeof value !== "object") {
    return false;
  }

  const track = value as Record<string, unknown>;
  return (
    typeof track.id === "string" &&
    typeof track.name === "string" &&
    typeof track.uri === "string" &&
    typeof track.isPlayable === "boolean" &&
    (typeof track.imageUrl === "string" || track.imageUrl === null) &&
    Array.isArray(track.artists)
  );
}

function parseTracks(value: string): SpotifyPlaylistTrack[] | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || !parsed.every(isTrack)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

type CachedTracksOptions = {
  /** Skip the cache read and force a fresh fetch (e.g. after a mutation). */
  force?: boolean;
};

export async function getCachedPlaylistTracks(
  accessToken: string,
  playlistId: string,
  options: CachedTracksOptions = {},
): Promise<SpotifyPlaylistTrack[]> {
  if (!options.force) {
    const cached = await db.playlistTrackCache.findUnique({
      where: { playlistId },
    });

    if (cached && Date.now() - cached.updatedAt.getTime() < CACHE_TTL_MS) {
      const tracks = parseTracks(cached.tracks);
      if (tracks) {
        return tracks;
      }
    }
  }

  const tracks = await getPlaylistTracks(accessToken, playlistId);
  const serialized = JSON.stringify(tracks);

  await db.playlistTrackCache.upsert({
    where: { playlistId },
    create: { playlistId, tracks: serialized },
    update: { tracks: serialized },
  });

  return tracks;
}

export async function invalidatePlaylistTracksCache(playlistId: string) {
  await db.playlistTrackCache
    .delete({ where: { playlistId } })
    .catch(() => {
      // No cached entry to remove; nothing to do.
    });
}
