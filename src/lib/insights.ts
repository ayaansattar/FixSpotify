import { db } from "@/lib/db";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import { getPlayCounts } from "@/lib/play-counts";
import { getPreferredPlaylists } from "@/lib/playlists";
import { describeSpotifyError } from "@/lib/spotify";

export type InsightsData = {
  summary: {
    totalPlays: number;
    uniquePlaylistTracks: number;
    neverPlayed: number;
    unplayable: number;
    preferredPlaylistCount: number;
  };
  playCountDistribution: Array<{
    label: string;
    songs: number;
  }>;
  topArtists: Array<{
    artist: string;
    plays: number;
    tracks: number;
  }>;
  playsByMonth: Array<{
    month: string;
    plays: number;
  }>;
  playlistSizes: Array<{
    playlist: string;
    tracks: number;
  }>;
};

/**
 * Aggregates listening-history + preferred-playlist cache data for the
 * Insights charts page.
 */
export async function getInsightsData(
  accessToken: string,
): Promise<InsightsData | { error: string }> {
  try {
    const playlists = await getPreferredPlaylists(accessToken);
    const trackLists = await Promise.all(
      playlists.map(async (playlist) => ({
        playlist,
        tracks: await getCachedPlaylistTracks(accessToken, playlist.id),
      })),
    );

    const uniqueById = new Map<
      string,
      {
        id: string;
        name: string;
        isPlayable: boolean;
        artistIds: string[];
        artistNames: string[];
      }
    >();

    for (const { tracks } of trackLists) {
      for (const track of tracks) {
        if (!uniqueById.has(track.id)) {
          uniqueById.set(track.id, {
            id: track.id,
            name: track.name,
            isPlayable: track.isPlayable,
            artistIds: track.artists.map((artist) => artist.id).filter(Boolean),
            artistNames: track.artists
              .map((artist) => artist.name)
              .filter(Boolean),
          });
        }
      }
    }

    const uniqueTracks = Array.from(uniqueById.values());
    const countByTrack = await getPlayCounts(
      uniqueTracks.map((track) => ({
        id: track.id,
        name: track.name,
        artistIds: track.artistIds,
        artistNames: track.artistNames,
      })),
      null,
      accessToken,
    );

    const bucketCounts = new Map<string, number>();
    const bucketOrder = [
      "0",
      "1",
      "2",
      "3–5",
      "6–10",
      "11–20",
      "21–50",
      "51+",
    ];
    for (const label of bucketOrder) {
      bucketCounts.set(label, 0);
    }

    const artistAgg = new Map<
      string,
      { plays: number; tracks: number; label: string }
    >();
    let neverPlayed = 0;
    let unplayable = 0;

    for (const track of uniqueTracks) {
      const plays = countByTrack.get(track.id) ?? 0;
      if (plays === 0) {
        neverPlayed += 1;
      }
      if (!track.isPlayable) {
        unplayable += 1;
      }

      const bucket = bucketForPlayCount(plays);
      bucketCounts.set(bucket, (bucketCounts.get(bucket) ?? 0) + 1);

      const artistKey =
        track.artistNames[0]?.trim().toLowerCase() ||
        track.artistIds[0] ||
        "unknown";
      const artistLabel = track.artistNames[0]?.trim() || "Unknown artist";
      const current = artistAgg.get(artistKey) ?? {
        plays: 0,
        tracks: 0,
        label: artistLabel,
      };
      current.plays += plays;
      current.tracks += 1;
      artistAgg.set(artistKey, current);
    }

    const since = new Date();
    since.setMonth(since.getMonth() - 17);
    since.setDate(1);
    since.setHours(0, 0, 0, 0);

    const recentPlays = await db.play.findMany({
      where: { playedAt: { gte: since } },
      select: { playedAt: true },
      orderBy: { playedAt: "asc" },
    });

    const monthCounts = new Map<string, number>();
    for (let i = 0; i < 18; i += 1) {
      const date = new Date(since);
      date.setMonth(since.getMonth() + i);
      monthCounts.set(monthKey(date), 0);
    }
    for (const play of recentPlays) {
      const key = monthKey(play.playedAt);
      if (monthCounts.has(key)) {
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      }
    }

    const totalPlays = await db.play.count();

    return {
      summary: {
        totalPlays,
        uniquePlaylistTracks: uniqueTracks.length,
        neverPlayed,
        unplayable,
        preferredPlaylistCount: playlists.length,
      },
      playCountDistribution: bucketOrder.map((label) => ({
        label,
        songs: bucketCounts.get(label) ?? 0,
      })),
      topArtists: Array.from(artistAgg.values())
        .sort((a, b) => b.plays - a.plays || b.tracks - a.tracks)
        .slice(0, 15)
        .map((row) => ({
          artist: row.label,
          plays: row.plays,
          tracks: row.tracks,
        })),
      playsByMonth: Array.from(monthCounts.entries()).map(([month, plays]) => ({
        month,
        plays,
      })),
      playlistSizes: trackLists
        .map(({ playlist, tracks }) => ({
          playlist: playlist.name,
          tracks: new Set(tracks.map((track) => track.id)).size,
        }))
        .sort((a, b) => b.tracks - a.tracks),
    };
  } catch (error) {
    return {
      error: describeSpotifyError(error, "Unable to load listening insights."),
    };
  }
}

function bucketForPlayCount(plays: number) {
  if (plays <= 0) return "0";
  if (plays === 1) return "1";
  if (plays === 2) return "2";
  if (plays <= 5) return "3–5";
  if (plays <= 10) return "6–10";
  if (plays <= 20) return "11–20";
  if (plays <= 50) return "21–50";
  return "51+";
}

function monthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}
