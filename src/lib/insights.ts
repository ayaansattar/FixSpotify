import { db } from "@/lib/db";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import { getPlayCounts } from "@/lib/play-counts";
import { getPreferredPlaylists } from "@/lib/playlists";
import { describeSpotifyError } from "@/lib/spotify";

export type PlaysOverTimeRange = "month" | "year" | "lifetime";

export type PlaysOverTimePoint = {
  label: string;
  plays: number;
};

export type RankMode = "most" | "least";

export type ArtistPlayRow = {
  artist: string;
  plays: number;
  tracks: number;
};

export type TrackPlayRow = {
  track: string;
  artist: string;
  plays: number;
};

export type InsightsData = {
  summary: {
    totalPlays: number;
    uniquePlaylistTracks: number;
    neverPlayed: number;
    unplayable: number;
    preferredPlaylistCount: number;
  };
  tracksByPlays: Record<RankMode, TrackPlayRow[]>;
  artistsByPlays: Record<RankMode, ArtistPlayRow[]>;
  playsOverTime: Record<PlaysOverTimeRange, PlaysOverTimePoint[]>;
};

const RANK_LIMIT = 15;

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

    const artistAgg = new Map<
      string,
      { plays: number; tracks: number; label: string }
    >();
    const trackRows: TrackPlayRow[] = [];
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

      trackRows.push({
        track: track.name,
        artist: track.artistNames.join(", ") || "Unknown artist",
        plays,
      });

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

    const artistsSorted = Array.from(artistAgg.values())
      .map((row) => ({
        artist: row.label,
        plays: row.plays,
        tracks: row.tracks,
      }))
      .sort(
        (a, b) =>
          b.plays - a.plays ||
          b.tracks - a.tracks ||
          a.artist.localeCompare(b.artist),
      );

    const tracksSorted = [...trackRows].sort(
      (a, b) =>
        b.plays - a.plays ||
        a.track.localeCompare(b.track) ||
        a.artist.localeCompare(b.artist),
    );

    const playDates = await db.play.findMany({
      select: { playedAt: true },
      orderBy: { playedAt: "asc" },
    });
    const playedAts = playDates.map((play) => play.playedAt);

    return {
      summary: {
        totalPlays: playDates.length,
        uniquePlaylistTracks: uniqueTracks.length,
        neverPlayed,
        unplayable,
        preferredPlaylistCount: playlists.length,
      },
      tracksByPlays: {
        most: tracksSorted.slice(0, RANK_LIMIT),
        least: [...tracksSorted].reverse().slice(0, RANK_LIMIT),
      },
      artistsByPlays: {
        most: artistsSorted.slice(0, RANK_LIMIT),
        least: [...artistsSorted].reverse().slice(0, RANK_LIMIT),
      },
      playsOverTime: {
        month: buildDailySeries(playedAts, 30),
        year: buildMonthlySeries(playedAts, 12),
        lifetime: buildLifetimeMonthlySeries(playedAts),
      },
    };
  } catch (error) {
    return {
      error: describeSpotifyError(error, "Unable to load listening insights."),
    };
  }
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function dayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function buildDailySeries(playedAts: Date[], days: number): PlaysOverTimePoint[] {
  const end = startOfDay(new Date());
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    counts.set(dayKey(date), 0);
  }

  for (const playedAt of playedAts) {
    if (playedAt < start) {
      continue;
    }
    const key = dayKey(playedAt);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([label, plays]) => ({
    label,
    plays,
  }));
}

function buildMonthlySeries(
  playedAts: Date[],
  months: number,
): PlaysOverTimePoint[] {
  const end = startOfMonth(new Date());
  const start = new Date(end);
  start.setMonth(end.getMonth() - (months - 1));

  const counts = new Map<string, number>();
  for (let i = 0; i < months; i += 1) {
    const date = new Date(start);
    date.setMonth(start.getMonth() + i);
    counts.set(monthKey(date), 0);
  }

  for (const playedAt of playedAts) {
    if (playedAt < start) {
      continue;
    }
    const key = monthKey(playedAt);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([label, plays]) => ({
    label,
    plays,
  }));
}

function buildLifetimeMonthlySeries(playedAts: Date[]): PlaysOverTimePoint[] {
  if (playedAts.length === 0) {
    return [];
  }

  const start = startOfMonth(playedAts[0]!);
  const end = startOfMonth(new Date());
  const months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth()) +
    1;

  const counts = new Map<string, number>();
  for (let i = 0; i < months; i += 1) {
    const date = new Date(start);
    date.setMonth(start.getMonth() + i);
    counts.set(monthKey(date), 0);
  }

  for (const playedAt of playedAts) {
    const key = monthKey(playedAt);
    if (counts.has(key)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries()).map(([label, plays]) => ({
    label,
    plays,
  }));
}
