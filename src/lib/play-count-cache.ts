import { createHash } from "node:crypto";

import { db } from "@/lib/db";

type CountableTrack = {
  id: string;
};

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
  return hashInput(`${trackIds}|${sinceKey}|${withIsrc ? "isrc" : "plain"}`);
}

export async function playHistoryVersion() {
  const aggregate = await db.play.aggregate({
    _count: { _all: true },
    _max: { playedAt: true },
  });

  return `${aggregate._count._all}:${aggregate._max.playedAt?.toISOString() ?? "none"}`;
}

export async function readPlayCountCache(
  tracks: CountableTrack[],
  since: Date | null,
  withIsrc: boolean,
) {
  const cacheKey = playCountCacheKey(tracks, since, withIsrc);
  const historyVersion = await playHistoryVersion();
  const cached = await db.playCountCache.findUnique({
    where: { cacheKey },
  });

  if (!cached || cached.historyVersion !== historyVersion) {
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
    return counts;
  } catch {
    return null;
  }
}

export async function writePlayCountCache(
  tracks: CountableTrack[],
  since: Date | null,
  withIsrc: boolean,
  counts: Map<string, number>,
) {
  const cacheKey = playCountCacheKey(tracks, since, withIsrc);
  const historyVersion = await playHistoryVersion();
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

export async function invalidatePlayCountCache() {
  await db.playCountCache.deleteMany();
}
