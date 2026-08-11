import { db } from "@/lib/db";
import { getPlaylistTracks, type SpotifyPlaylistTrack } from "@/lib/spotify";

/**
 * How long a cached playlist track list is considered fresh. Large playlists
 * cost ~1 Spotify request per 50 tracks, so caching avoids re-fetching all
 * pages on every dashboard/shuffle load and keeps us under the rate limit.
 * Local add/remove mutations patch the cache in place. Refresh from Spotify
 * forces a fetch. The TTL only covers edits made in the Spotify client
 * outside this app.
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

async function writePlaylistTracksCache(
  playlistId: string,
  tracks: SpotifyPlaylistTrack[],
) {
  const serialized = JSON.stringify(tracks);
  await db.playlistTrackCache.upsert({
    where: { playlistId },
    create: { playlistId, tracks: serialized },
    update: { tracks: serialized },
  });
}

type CachedTracksOptions = {
  /** Skip the cache read and force a fresh fetch (e.g. Refresh from Spotify). */
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
  await writePlaylistTracksCache(playlistId, tracks);
  return tracks;
}

/** Patch cache after a local add so we don't re-page the whole playlist. */
export async function appendTrackToPlaylistCache(
  playlistId: string,
  track: SpotifyPlaylistTrack,
) {
  const cached = await db.playlistTrackCache.findUnique({
    where: { playlistId },
  });
  if (!cached) {
    return;
  }

  const tracks = parseTracks(cached.tracks);
  if (!tracks) {
    await invalidatePlaylistTracksCache(playlistId);
    return;
  }

  if (tracks.some((entry) => entry.uri === track.uri || entry.id === track.id)) {
    return;
  }

  await writePlaylistTracksCache(playlistId, [...tracks, track]);
}

/** Patch cache after a local remove so we don't re-page the whole playlist. */
export async function removeTrackFromPlaylistCache(
  playlistId: string,
  trackId: string,
) {
  const cached = await db.playlistTrackCache.findUnique({
    where: { playlistId },
  });
  if (!cached) {
    return;
  }

  const tracks = parseTracks(cached.tracks);
  if (!tracks) {
    await invalidatePlaylistTracksCache(playlistId);
    return;
  }

  const next = tracks.filter((entry) => entry.id !== trackId);
  if (next.length === tracks.length) {
    return;
  }

  await writePlaylistTracksCache(playlistId, next);
}

export async function invalidatePlaylistTracksCache(playlistId: string) {
  await db.playlistTrackCache
    .delete({ where: { playlistId } })
    .catch(() => {
      // No cached entry to remove; nothing to do.
    });
}
