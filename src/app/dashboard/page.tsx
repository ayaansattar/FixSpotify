import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardFilters } from "@/components/dashboard-filters";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getCurrentSpotifyUser,
  getCurrentUserPlaylists,
  getPlaylistTracks,
  SpotifyApiError,
  type SpotifyPlaylist,
  type SpotifyPlaylistTrack,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

const windows = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 365, label: "1 year" },
] as const;

type DashboardProps = {
  searchParams: Promise<{
    playlist?: string;
    days?: string;
  }>;
};

type RankedTrack = SpotifyPlaylistTrack & {
  playCount: number;
};

type DashboardData =
  | {
      error: string;
    }
  | {
      playlists: SpotifyPlaylist[];
      selectedPlaylist: SpotifyPlaylist | null;
      rankedTracks: RankedTrack[];
    };

export default async function Dashboard({ searchParams }: DashboardProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return <DashboardError message="Sign out and reconnect Spotify to continue." />;
  }

  const params = await searchParams;
  const requestedDays = Number(params.days);
  const days = windows.some((window) => window.days === requestedDays)
    ? requestedDays
    : 30;

  const data = await loadDashboardData(
    accessToken,
    params.playlist,
    days,
  );

  if ("error" in data) {
    return <DashboardError message={data.error} />;
  }

  if (!data.selectedPlaylist) {
    return (
      <DashboardShell>
        <p className="text-[#a7b0aa]">
          No owned playlists are available. Create a playlist in Spotify, then
          return here.
        </p>
      </DashboardShell>
    );
  }

  const { playlists, rankedTracks, selectedPlaylist } = data;

  return (
      <DashboardShell>
        <DashboardFilters
          days={days}
          playlists={playlists.map((playlist) => ({
            id: playlist.id,
            name: playlist.name,
          }))}
          selectedPlaylistId={selectedPlaylist.id}
          windows={windows}
        />

        <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">{selectedPlaylist.name}</h2>
            <p className="mt-1 text-sm text-[#a7b0aa]">
              Least listened in the last {days} days
            </p>
          </div>
          <p className="text-sm text-[#a7b0aa]">
            {rankedTracks.length} unique tracks
          </p>
        </div>

        {rankedTracks.length > 0 ? (
          <ol className="mt-5 overflow-hidden rounded-2xl border border-white/10">
            {rankedTracks.map((track, index) => (
              <li
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-white/10 px-4 py-4 last:border-b-0"
                key={track.id}
              >
                <span className="text-sm tabular-nums text-[#69736d]">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{track.name}</p>
                  <p className="truncate text-sm text-[#a7b0aa]">
                    {track.artists.map((artist) => artist.name).join(", ")}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-3 py-1 text-sm tabular-nums">
                  {track.playCount} {track.playCount === 1 ? "play" : "plays"}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-5 rounded-2xl border border-white/10 p-6 text-[#a7b0aa]">
            This playlist has no available tracks.
          </p>
        )}

        <p className="mt-5 text-xs leading-5 text-[#69736d]">
          Counts currently use the listening history collected since this app
          started. Your requested Spotify export can backfill older history
          when it arrives.
        </p>
      </DashboardShell>
  );
}

async function loadDashboardData(
  accessToken: string,
  requestedPlaylistId: string | undefined,
  days: number,
): Promise<DashboardData> {
  try {
    const [spotifyUser, allPlaylists] = await Promise.all([
      getCurrentSpotifyUser(accessToken),
      getCurrentUserPlaylists(accessToken),
    ]);

    // Spotify's 2026 Development Mode API only exposes playlist items for
    // playlists owned by or collaborated on by the signed-in user. Restricting
    // this list to owned playlists prevents followed public playlists from
    // failing with a 403 when selected.
    const playlists = allPlaylists
      .filter((playlist) => playlist.owner?.id === spotifyUser.id)
      .sort((a, b) => a.name.localeCompare(b.name));
    const selectedPlaylist =
      playlists.find((playlist) => playlist.id === requestedPlaylistId) ??
      playlists[0] ??
      null;

    if (!selectedPlaylist) {
      return { playlists, selectedPlaylist: null, rankedTracks: [] };
    }

    const playlistTracks = await getPlaylistTracks(
      accessToken,
      selectedPlaylist.id,
    );
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );
    const since = new Date();
    since.setDate(since.getDate() - days);

    const countByTrack = await getPlayCounts(
      uniqueTracks.map((track) => track.id),
      since,
    );
    const rankedTracks = uniqueTracks
      .map((track) => ({
        ...track,
        playCount: countByTrack.get(track.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          a.playCount - b.playCount || a.name.localeCompare(b.name),
      );

    return { playlists, selectedPlaylist, rankedTracks };
  } catch (error) {
    return {
      error:
        error instanceof SpotifyApiError && error.status === 403
          ? "Spotify only allows this app to inspect playlists you own or collaborate on."
          : error instanceof Error
            ? error.message
            : "Unable to load your playlists.",
    };
  }
}

async function getPlayCounts(trackIds: string[], since: Date) {
  const countByTrack = new Map<string, number>();
  // SQLite limits query parameters (999 in Prisma's driver), so large
  // playlists must be counted in chunks.
  const chunkSize = 500;

  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const playCounts = await db.play.groupBy({
      by: ["trackId"],
      where: {
        trackId: {
          in: chunk,
        },
        playedAt: {
          gte: since,
        },
      },
      _count: {
        _all: true,
      },
    });

    for (const play of playCounts) {
      countByTrack.set(play.trackId, play._count._all);
    }
  }

  return countByTrack;
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1ed760]">
            Spotify Manager
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Least-listened tracks
          </h1>
        </div>
        <Link className="text-sm text-[#a7b0aa] hover:text-white" href="/">
          Home
        </Link>
      </header>
      {children}
    </main>
  );
}

function DashboardError({ message }: { message: string }) {
  return (
    <DashboardShell>
      <div className="rounded-2xl border border-red-300/20 bg-red-300/5 p-6">
        <p className="text-red-200">{message}</p>
      </div>
    </DashboardShell>
  );
}
