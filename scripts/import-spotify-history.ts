import "dotenv/config";

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { db } from "../src/lib/db";

const MIN_PLAY_MS = 30_000;
const INSERT_BATCH_SIZE = 1_000;

type SpotifyHistoryRecord = {
  ts?: unknown;
  ms_played?: unknown;
  master_metadata_track_name?: unknown;
  spotify_track_uri?: unknown;
};

type ImportablePlay = {
  trackId: string;
  trackName: string;
  artistId: string;
  playedAt: Date;
};

async function main() {
  const historyDirectory = path.resolve(
    process.argv[2] ?? "spotify_history",
  );
  const fileNames = (await readdir(historyDirectory))
    .filter(
      (fileName) =>
        /^Streaming_History_(Audio|Video).+\.json$/i.test(fileName),
    )
    .sort();

  if (fileNames.length === 0) {
    throw new Error(`No Spotify history JSON files found in ${historyDirectory}`);
  }

  const playsByKey = new Map<string, ImportablePlay>();
  let recordsRead = 0;
  let excludedShort = 0;
  let excludedNonTrack = 0;
  let excludedInvalid = 0;
  let duplicateExportRows = 0;

  for (const fileName of fileNames) {
    const filePath = path.join(historyDirectory, fileName);
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error(`${fileName} does not contain a JSON array`);
    }

    recordsRead += parsed.length;

    for (const rawRecord of parsed) {
      const record = rawRecord as SpotifyHistoryRecord;

      if (
        typeof record.spotify_track_uri !== "string" ||
        !record.spotify_track_uri.startsWith("spotify:track:")
      ) {
        excludedNonTrack += 1;
        continue;
      }

      if (
        typeof record.ms_played !== "number" ||
        record.ms_played <= MIN_PLAY_MS
      ) {
        excludedShort += 1;
        continue;
      }

      if (
        typeof record.ts !== "string" ||
        typeof record.master_metadata_track_name !== "string"
      ) {
        excludedInvalid += 1;
        continue;
      }

      const playedAt = new Date(record.ts);
      const trackId = record.spotify_track_uri.slice("spotify:track:".length);

      if (!trackId || Number.isNaN(playedAt.getTime())) {
        excludedInvalid += 1;
        continue;
      }

      const key = `${trackId}:${playedAt.toISOString()}`;

      if (playsByKey.has(key)) {
        duplicateExportRows += 1;
        continue;
      }

      playsByKey.set(key, {
        trackId,
        trackName: record.master_metadata_track_name,
        // Spotify's history export contains the artist name but not artist ID.
        // Dashboard counts join on trackId, so this does not affect reports.
        artistId: "unknown",
        playedAt,
      });
    }

    console.log(`Read ${fileName}: ${parsed.length.toLocaleString()} records`);
  }

  const existingPlays = await db.play.findMany({
    select: { trackId: true, playedAt: true },
  });
  const existingKeys = new Set(
    existingPlays.map(
      (play) => `${play.trackId}:${play.playedAt.toISOString()}`,
    ),
  );
  const freshPlays = Array.from(playsByKey.entries())
    .filter(([key]) => !existingKeys.has(key))
    .map(([, play]) => play);

  let inserted = 0;

  for (let i = 0; i < freshPlays.length; i += INSERT_BATCH_SIZE) {
    const batch = freshPlays.slice(i, i + INSERT_BATCH_SIZE);
    const result = await db.play.createMany({ data: batch });
    inserted += result.count;
    console.log(
      `Inserted ${inserted.toLocaleString()} / ${freshPlays.length.toLocaleString()}`,
    );
  }

  const totalPlays = await db.play.count();

  console.log("\nImport complete");
  console.log(`Files read: ${fileNames.length}`);
  console.log(`Records read: ${recordsRead.toLocaleString()}`);
  console.log(
    `Excluded (30 seconds or less): ${excludedShort.toLocaleString()}`,
  );
  console.log(`Excluded (not a track): ${excludedNonTrack.toLocaleString()}`);
  console.log(`Excluded (invalid): ${excludedInvalid.toLocaleString()}`);
  console.log(
    `Duplicate rows in export: ${duplicateExportRows.toLocaleString()}`,
  );
  console.log(
    `Already in database: ${(playsByKey.size - freshPlays.length).toLocaleString()}`,
  );
  console.log(`Inserted: ${inserted.toLocaleString()}`);
  console.log(`Total plays in database: ${totalPlays.toLocaleString()}`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
