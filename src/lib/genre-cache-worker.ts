import { db } from "@/lib/db";
import {
  cacheGenresForArtists,
  type ArtistRef,
} from "@/lib/genres";

const ARTISTS_PER_RUN = 50;

declare global {
  var __genreCacheWorkerRunning: boolean | undefined;
}

type CachedTrack = {
  artists?: Array<{
    id?: unknown;
    name?: unknown;
  }>;
};

export async function runGenreCacheWorker() {
  if (globalThis.__genreCacheWorkerRunning) {
    console.info("[genre-cache] Skipping run: worker is already active");
    return;
  }

  globalThis.__genreCacheWorkerRunning = true;

  try {
    const preferences = await db.playlistPreference.findMany({
      select: { playlistId: true },
    });
    const playlistIds = preferences.map((entry) => entry.playlistId);
    const caches = await db.playlistTrackCache.findMany({
      where:
        playlistIds.length > 0
          ? { playlistId: { in: playlistIds } }
          : undefined,
      select: { tracks: true },
    });
    const artists: ArtistRef[] = [];

    for (const cache of caches) {
      const tracks = parseCachedTracks(cache.tracks);

      for (const track of tracks) {
        for (const artist of track.artists ?? []) {
          if (
            typeof artist.id === "string" &&
            typeof artist.name === "string" &&
            artist.id &&
            artist.name
          ) {
            artists.push({ id: artist.id, name: artist.name });
          }
        }
      }
    }

    if (artists.length === 0) {
      console.info(
        "[genre-cache] No cached playlist artists found; visit a playlist page first",
      );
      return;
    }

    const result = await cacheGenresForArtists(artists, ARTISTS_PER_RUN);
    console.info(
      `[genre-cache] attempted=${result.attempted} saved=${result.saved} failed=${result.failed} remaining=${result.remaining}`,
    );
  } catch (error) {
    console.error("[genre-cache] Background lookup failed", error);
  } finally {
    globalThis.__genreCacheWorkerRunning = false;
  }
}

function parseCachedTracks(value: string): CachedTrack[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? (parsed as CachedTrack[]) : [];
  } catch {
    return [];
  }
}
