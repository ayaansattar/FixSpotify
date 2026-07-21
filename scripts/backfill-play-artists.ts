/**
 * Backfills Play.artistName for rows stored before that column existed.
 * Uses preferred playlist track caches (known artist names by track ID) and
 * any Play rows that already have an artistName for the same trackId.
 */
import "dotenv/config";

import { db } from "../src/lib/db";

type CachedTrack = {
  id?: unknown;
  artists?: Array<{ name?: unknown }>;
};

async function main() {
  const artistNameByTrackId = new Map<string, string>();

  const namedPlays = await db.play.findMany({
    where: { artistName: { not: "" } },
    select: { trackId: true, artistName: true },
    distinct: ["trackId"],
  });

  for (const play of namedPlays) {
    artistNameByTrackId.set(play.trackId, play.artistName);
  }

  const preferences = await db.playlistPreference.findMany({
    select: { playlistId: true },
  });
  const caches = await db.playlistTrackCache.findMany({
    where:
      preferences.length > 0
        ? { playlistId: { in: preferences.map((p) => p.playlistId) } }
        : undefined,
    select: { tracks: true },
  });

  for (const cache of caches) {
    let tracks: CachedTrack[] = [];

    try {
      const parsed = JSON.parse(cache.tracks) as unknown;
      tracks = Array.isArray(parsed) ? (parsed as CachedTrack[]) : [];
    } catch {
      continue;
    }

    for (const track of tracks) {
      if (typeof track.id !== "string" || !track.id) {
        continue;
      }

      if (artistNameByTrackId.has(track.id)) {
        continue;
      }

      const names = (track.artists ?? [])
        .map((artist) => (typeof artist.name === "string" ? artist.name : ""))
        .filter(Boolean)
        .join(", ");

      if (names) {
        artistNameByTrackId.set(track.id, names);
      }
    }
  }

  let updated = 0;

  for (const [trackId, artistName] of artistNameByTrackId) {
    const result = await db.play.updateMany({
      where: { trackId, artistName: "" },
      data: { artistName },
    });
    updated += result.count;
  }

  const stillBlank = await db.play.count({ where: { artistName: "" } });

  console.log(`Backfilled artistName on ${updated.toLocaleString()} play rows`);
  console.log(
    `Plays still missing artistName: ${stillBlank.toLocaleString()}`,
  );
  console.log(
    "Tip: re-run npm run history:import with your Spotify export to fill the rest.",
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
