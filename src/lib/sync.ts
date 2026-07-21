import { db } from "@/lib/db";
import { getRecentlyPlayed } from "@/lib/spotify";

type SyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  totalPlays: number;
};

export async function syncRecentlyPlayed(
  accessToken: string,
): Promise<SyncResult> {
  const response = await getRecentlyPlayed(accessToken);

  const plays = response.items
    .filter((item) => item.track?.id)
    .map((item) => ({
      trackId: item.track!.id,
      trackName: item.track!.name,
      artistId: item.track!.artists[0]?.id ?? "unknown",
      artistName:
        item.track!.artists.map((artist) => artist.name).filter(Boolean).join(", ") ||
        "",
      playedAt: new Date(item.played_at),
    }));

  const existing = plays.length
    ? await db.play.findMany({
        where: {
          OR: plays.map((play) => ({
            trackId: play.trackId,
            playedAt: play.playedAt,
          })),
        },
        select: {
          trackId: true,
          playedAt: true,
        },
      })
    : [];

  const existingKeys = new Set(
    existing.map(
      (play) => `${play.trackId}:${play.playedAt.toISOString()}`,
    ),
  );

  const freshPlays = plays.filter(
    (play) => !existingKeys.has(`${play.trackId}:${play.playedAt.toISOString()}`),
  );

  if (freshPlays.length > 0) {
    await db.play.createMany({ data: freshPlays });
  }

  // Backfill artist names onto older rows that share these track IDs but were
  // stored before artistName existed.
  for (const play of plays) {
    if (!play.artistName) {
      continue;
    }

    await db.play.updateMany({
      where: {
        trackId: play.trackId,
        artistName: "",
      },
      data: {
        artistId: play.artistId,
        artistName: play.artistName,
      },
    });
  }

  const totalPlays = await db.play.count();

  return {
    fetched: plays.length,
    inserted: freshPlays.length,
    skipped: plays.length - freshPlays.length,
    totalPlays,
  };
}
