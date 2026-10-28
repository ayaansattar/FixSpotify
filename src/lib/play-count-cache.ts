import { createHash } from "node:crypto";

import { db } from "@/lib/db";

type CountableTrack = {
  id: string;
};

/** Bump when play-count matching rules change so cached rows recompute. */
const MATCHER_VERSION = 3;

function hashInput(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function playCountCacheKey(
  tracks: CountableTrack[],
  since: Date | null,
  withIsrc: boolean,
) {
  const trackIds = tracks
    .map((track) => track.id)
    .sort()
    .join(",");
  const sinceKey = since?.toISOString() ?? "lifetime";
  return hashInput(
    `${trackIds}|${sinceKey}|${withIsrc ? "isrc" : "plain"}|v${MATCHER_VERSION}`,
  );
}

export async function playHistoryVersion() {
  const aggregate = await db.play.aggregate({
    _count: { _all: true },
    _max: { playedAt: true },
  });

  return `${aggregate._count._all}:${aggregate._max.playedAt?.toISOString() ?? "none"}`;
}

/** Sentinel historyVersion: row is outdated but still servable while it recomputes. */
const STALE_VERSION = "stale";

/**
 * Returns cached counts, or null when there is no usable row. `fresh` is false
 * when play history moved on since the row was written; callers may serve
 * those counts while recomputing in the background.
 */
export async function readPlayCountCache(
  tracks: CountableTrack[],
  since: Date | null,
  withIsrc: boolean,
) {
  const cacheKey = playCountCacheKey(tracks, since, withIsrc);
  const [historyVersion, cached] = await Promise.all([
    playHistoryVersion(),
    db.playCountCache.findUnique({ where: { cacheKey } }),
  ]);

  if (!cached) {
    return null;
  }

  try {
    const parsed = JSON.parse(cached.counts) as Record<string, number>;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const counts = new Map<string, number>();
    for (const track of tracks) {
      counts.set(track.id, parsed[track.id] ?? 0);
    }
    return { counts, fresh: cached.historyVersion === historyVersion };
  } catch {
    return null;
  }
}

/**
 * `historyVersion` should be read before computing `counts`, so a sync that
 * lands mid-compute leaves the row stale instead of marking old counts fresh.
 */
export async function writePlayCountCache(
  tracks: CountableTrack[],
  since: Date | null,
  withIsrc: boolean,
  counts: Map<string, number>,
  historyVersion: string,
) {
  const cacheKey = playCountCacheKey(tracks, since, withIsrc);
  const payload: Record<string, number> = {};

  for (const track of tracks) {
    payload[track.id] = counts.get(track.id) ?? 0;
  }

  await db.playCountCache.upsert({
    where: { cacheKey },
    create: {
      cacheKey,
      counts: JSON.stringify(payload),
      historyVersion,
    },
    update: {
      counts: JSON.stringify(payload),
      historyVersion,
    },
  });
}

/**
 * Mark every row stale (rather than deleting) so the next page load serves the
 * previous counts instantly and recomputes in the background. Also covers
 * artist backfills, which don't change the play count/max used by
 * playHistoryVersion.
 */
export async function invalidatePlayCountCache() {
  await db.playCountCache.updateMany({
    data: { historyVersion: STALE_VERSION },
  });
}
