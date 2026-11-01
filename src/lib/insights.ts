import { db } from "@/lib/db";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import { getPlayCounts, getPlayStats } from "@/lib/play-counts";
import { getPreferredPlaylists } from "@/lib/playlists";
import { describeSpotifyError } from "@/lib/spotify";

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

export type LeastListenedRow = {
  trackId: string;
  track: string;
  artist: string;
  plays: number;
  /** ISO timestamp of the last play past the listen threshold. */
  lastPlayedAt: string | null;
  listenScore: number;
};

export type PlaylistLeastListened = {
  playlistId: string;
  playlist: string;
  trackCount: number;
  rows: LeastListenedRow[];
};

export type PlaylistHealthRow = {
  playlistId: string;
  playlist: string;
  trackCount: number;
  totalPlays: number;
  avgPlays: number;
  neverPlayed: number;
  neverPlayedPct: number;
  stale: number;
  stalePct: number;
  concentration: number;
  healthScore: number;
  unplayable: number;
};

export type InsightsData = {
  summary: {
    totalPlays: number;
    uniquePlaylistTracks: number;
    neverPlayed: number;
    unplayable: number;
    preferredPlaylistCount: number;
    avgPlaylistHealth: number;
  };
  tracksByPlays: Record<RankMode, TrackPlayRow[]>;
  artistsByPlays: Record<RankMode, ArtistPlayRow[]>;
  playlistHealth: PlaylistHealthRow[];
  leastListenedByPlaylist: PlaylistLeastListened[];
};

const RANK_LIMIT = 15;
/** Tracks with no plays in this window count as stale for playlist health. */
const STALE_DAYS = 90;
/** Days for a track's listen score to halve since its last play. */
const LISTEN_SCORE_HALF_LIFE_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

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
    const countable = uniqueTracks.map((track) => ({
      id: track.id,
      name: track.name,
      artistIds: track.artistIds,
      artistNames: track.artistNames,
    }));

    const staleSince = new Date();
    staleSince.setDate(staleSince.getDate() - STALE_DAYS);

    const [statsByTrack, recentCountByTrack] = await Promise.all([
      getPlayStats(countable, null, accessToken),
      getPlayCounts(countable, staleSince, accessToken),
    ]);
    const countByTrack = new Map(
      Array.from(statsByTrack, ([trackId, stats]) => [trackId, stats.count]),
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

    const playlistHealth = trackLists
      .map(({ playlist, tracks }) => {
        const playValues = tracks.map((track) => countByTrack.get(track.id) ?? 0);
        const trackCount = tracks.length;
        const totalPlays = playValues.reduce((sum, plays) => sum + plays, 0);
        const neverPlayedCount = playValues.filter((plays) => plays === 0).length;
        const staleCount = tracks.filter(
          (track) => (recentCountByTrack.get(track.id) ?? 0) === 0,
        ).length;
        const unplayableCount = tracks.filter((track) => !track.isPlayable)
          .length;
        const avgPlays = trackCount === 0 ? 0 : totalPlays / trackCount;
        const neverPlayedPct =
          trackCount === 0 ? 0 : (neverPlayedCount / trackCount) * 100;
        const stalePct = trackCount === 0 ? 0 : (staleCount / trackCount) * 100;
        const concentration = playConcentration(playValues);

        return {
          playlistId: playlist.id,
          playlist: playlist.name,
          trackCount,
          totalPlays,
          avgPlays: Math.round(avgPlays * 10) / 10,
          neverPlayed: neverPlayedCount,
          neverPlayedPct: Math.round(neverPlayedPct),
          stale: staleCount,
          stalePct: Math.round(stalePct),
          concentration: Math.round(concentration * 100),
          healthScore: playlistHealthScore({
            neverPlayedRatio: trackCount === 0 ? 1 : neverPlayedCount / trackCount,
            staleRatio: trackCount === 0 ? 1 : staleCount / trackCount,
            concentration,
            avgPlays,
            unplayableRatio: trackCount === 0 ? 0 : unplayableCount / trackCount,
          }),
          unplayable: unplayableCount,
        } satisfies PlaylistHealthRow;
      })
      .sort(
        (a, b) =>
          b.healthScore - a.healthScore ||
          a.playlist.localeCompare(b.playlist),
      );

    const now = Date.now();
    const leastListenedByPlaylist = trackLists.map(({ playlist, tracks }) => {
      const uniquePlaylistTracks = Array.from(
        new Map(tracks.map((track) => [track.id, track])).values(),
      );
      const rows = uniquePlaylistTracks
        .map((track) => {
          const stats = statsByTrack.get(track.id);
          const plays = stats?.count ?? 0;
          const lastPlayedAt = stats?.lastPlayedAt ?? null;

          return {
            trackId: track.id,
            track: track.name,
            artist:
              track.artists.map((artist) => artist.name).join(", ") ||
              "Unknown artist",
            plays,
            lastPlayedAt: lastPlayedAt?.toISOString() ?? null,
            listenScore: listenScore(
              plays,
              lastPlayedAt ? (now - lastPlayedAt.getTime()) / DAY_MS : null,
            ),
          };
        })
        .sort(
          (a, b) =>
            a.listenScore - b.listenScore ||
            a.plays - b.plays ||
            (a.lastPlayedAt ?? "").localeCompare(b.lastPlayedAt ?? "") ||
            a.track.localeCompare(b.track),
        )
        .map((row) => ({
          ...row,
          listenScore: Math.round(row.listenScore * 100) / 100,
        }));

      return {
        playlistId: playlist.id,
        playlist: playlist.name,
        trackCount: uniquePlaylistTracks.length,
        rows,
      } satisfies PlaylistLeastListened;
    });

    const avgPlaylistHealth =
      playlistHealth.length === 0
        ? 0
        : Math.round(
            playlistHealth.reduce((sum, row) => sum + row.healthScore, 0) /
              playlistHealth.length,
          );

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

    const totalPlays = await db.play.count();

    return {
      summary: {
        totalPlays,
        uniquePlaylistTracks: uniqueTracks.length,
        neverPlayed,
        unplayable,
        preferredPlaylistCount: playlists.length,
        avgPlaylistHealth,
      },
      tracksByPlays: {
        most: tracksSorted.slice(0, RANK_LIMIT),
        least: [...tracksSorted].reverse().slice(0, RANK_LIMIT),
      },
      artistsByPlays: {
        most: artistsSorted.slice(0, RANK_LIMIT),
        least: [...artistsSorted].reverse().slice(0, RANK_LIMIT),
      },
      playlistHealth,
      leastListenedByPlaylist,
    };
  } catch (error) {
    return {
      error: describeSpotifyError(error, "Unable to load listening insights."),
    };
  }
}

/**
 * Combines how often and how recently a track was heard: log-scaled plays,
 * halved for every LISTEN_SCORE_HALF_LIFE_DAYS since the last play. Lower is
 * less listened; never played is 0. So a song binged two years ago ranks
 * below one played a couple of times this month.
 */
function listenScore(plays: number, daysSinceLastPlay: number | null) {
  if (plays === 0 || daysSinceLastPlay === null) {
    return 0;
  }

  return (
    Math.log2(1 + plays) *
    0.5 ** (Math.max(0, daysSinceLastPlay) / LISTEN_SCORE_HALF_LIFE_DAYS)
  );
}

/**
 * Share of plays owned by the top 20% of tracks (by play count).
 * 0.2 is perfectly even; near 1.0 means a few songs dominate.
 */
function playConcentration(plays: number[]): number {
  if (plays.length === 0) {
    return 0;
  }

  const total = plays.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return 0;
  }

  const sorted = [...plays].sort((a, b) => b - a);
  const topCount = Math.max(1, Math.ceil(sorted.length * 0.2));
  const topPlays = sorted
    .slice(0, topCount)
    .reduce((sum, value) => sum + value, 0);
  return topPlays / total;
}

function playlistHealthScore({
  neverPlayedRatio,
  staleRatio,
  concentration,
  avgPlays,
  unplayableRatio,
}: {
  neverPlayedRatio: number;
  staleRatio: number;
  concentration: number;
  avgPlays: number;
  unplayableRatio: number;
}) {
  const playedScore = (1 - neverPlayedRatio) * 40;
  const freshScore = (1 - staleRatio) * 30;
  // Ideal concentration roughly matches the top-20% share (~0.2).
  const concentrationPenalty = Math.min(
    1,
    Math.max(0, (concentration - 0.2) / 0.8),
  );
  const balanceScore = (1 - concentrationPenalty) * 20;
  const volumeScore = Math.min(avgPlays / 5, 1) * 10;
  const availabilityPenalty = unplayableRatio * 8;

  return Math.max(
    0,
    Math.min(
      100,
      Math.round(
        playedScore +
          freshScore +
          balanceScore +
          volumeScore -
          availabilityPenalty,
      ),
    ),
  );
}
