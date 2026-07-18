import cron from "node-cron";

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

export function startScheduler() {
  if (globalThis.__spotifySchedulerStarted) {
    return;
  }

  globalThis.__spotifySchedulerStarted = true;

  cron.schedule("0 * * * *", () => {
    void runHourlySync();
  });

  console.info("[scheduler] Hourly play sync scheduled");
}
