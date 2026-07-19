import cron from "node-cron";

import { db } from "@/lib/db";
import { runGenreCacheWorker } from "@/lib/genre-cache-worker";
import { syncRecentlyPlayed } from "@/lib/sync";
import { getValidAccessToken } from "@/lib/tokens";

declare global {
  var __spotifySchedulerStarted: boolean | undefined;
}

async function runHourlySync() {
  try {
    const accessToken = await getValidAccessToken();

    if (!accessToken) {
      console.warn(
        "[scheduler] Skipping sync: no stored Spotify token. Sign in once to enable cron sync.",
      );
      return;
    }

    const result = await syncRecentlyPlayed(accessToken);
    console.info(
      `[scheduler] Synced plays — fetched=${result.fetched} inserted=${result.inserted} total=${result.totalPlays}`,
    );
  } catch (error) {
    console.error("[scheduler] Sync failed", error);
  }
}

async function purgeDeletedTrackHistory() {
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const result = await db.deletedTrack.deleteMany({
      where: {
        deletedAt: {
          lt: cutoff,
        },
      },
    });

    if (result.count > 0) {
      console.info(
        `[scheduler] Purged ${result.count} deletion history entries older than seven days`,
      );
    }
  } catch (error) {
    console.error("[scheduler] Deletion history cleanup failed", error);
  }
}

export function startScheduler() {
  if (globalThis.__spotifySchedulerStarted) {
    return;
  }

  globalThis.__spotifySchedulerStarted = true;

  cron.schedule("0 * * * *", () => {
    void runHourlySync();
  });

  cron.schedule("15 0 * * *", () => {
    void purgeDeletedTrackHistory();
  });

  cron.schedule("10 * * * *", () => {
    void runGenreCacheWorker();
  });

  void purgeDeletedTrackHistory();
  void runGenreCacheWorker();
  console.info(
    "[scheduler] Hourly play sync, genre cache, and daily cleanup scheduled",
  );
}
