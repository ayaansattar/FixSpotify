import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardFilters } from "@/components/dashboard-filters";
import { RefreshButton } from "@/components/refresh-button";
import { TrackList } from "@/components/track-list";
import { authOptions } from "@/lib/auth";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import { getPlayStats } from "@/lib/play-counts";
import { getPreferredPlaylists } from "@/lib/playlists";
import {
  describeSpotifyError,
  type SpotifyPlaylist,
  type SpotifyPlaylistTrack,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

type LastListenedProps = {
  searchParams: Promise<{
    playlist?: string;
  }>;
};

type DatedTrack = SpotifyPlaylistTrack & {
  playCount: number;
  lastPlayedAt: string | null;
};

type LastListenedData =
  | {
      error: string;
    }
  | {
      playlists: SpotifyPlaylist[];
      selectedPlaylist: SpotifyPlaylist | null;
      datedTracks: DatedTrack[];
    };

export default async function LastListened({
  searchParams,
}: LastListenedProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return (
      <LastListenedError message="Sign out and reconnect Spotify to continue." />
    );
  }

  const params = await searchParams;
  const data = await loadLastListenedData(accessToken, params.playlist);

  if ("error" in data) {
    return <LastListenedError message={data.error} />;
  }

  if (!data.selectedPlaylist) {
    return (
      <LastListenedShell>
        <p className="text-[#a7b0aa]">
          No owned playlists are available. Create a playlist in Spotify, then
          return here.
        </p>
      </LastListenedShell>
    );
  }

  const { playlists, datedTracks, selectedPlaylist } = data;

  return (
    <LastListenedShell>
      <DashboardFilters
        basePath="/last-listened"
        playlists={playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
        }))}
        selectedPlaylistId={selectedPlaylist.id}
      />

      <div className="mt-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">{selectedPlaylist.name}</h2>
          <p className="mt-1 text-sm text-[#a7b0aa]">
            Longest since you last heard it first
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <RefreshButton playlistId={selectedPlaylist.id} />
          <p className="text-sm text-[#a7b0aa]">
            {datedTracks.length} unique tracks
          </p>
        </div>
      </div>

      <TrackList
        initialTracks={datedTracks}
        key={selectedPlaylist.id}
        playlistId={selectedPlaylist.id}
        playlistName={selectedPlaylist.name}
        variant="lastListened"
      />

      <p className="mt-5 text-xs leading-5 text-[#69736d]">
        Dates are the last play longer than 30 seconds, from your imported
        Spotify extended history plus the plays this app has synced since.
        Never-played tracks are listed first.
      </p>
    </LastListenedShell>
  );
}

async function loadLastListenedData(
  accessToken: string,
  requestedPlaylistId: string | undefined,
): Promise<LastListenedData> {
  try {
    const playlists = await getPreferredPlaylists(accessToken);
    const selectedPlaylist =
      playlists.find((playlist) => playlist.id === requestedPlaylistId) ??
      playlists[0] ??
      null;

    if (!selectedPlaylist) {
      return { playlists, selectedPlaylist: null, datedTracks: [] };
    }

    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      selectedPlaylist.id,
    );
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );

    // Lifetime stats: shares the cache row with the lifetime dashboard.
    const statsByTrack = await getPlayStats(
      uniqueTracks.map((track) => ({
        id: track.id,
        name: track.name,
        artistIds: track.artists.map((artist) => artist.id).filter(Boolean),
        artistNames: track.artists.map((artist) => artist.name).filter(Boolean),
      })),
      null,
      accessToken,
    );
    const datedTracks = uniqueTracks
      .map((track) => {
        const stats = statsByTrack.get(track.id);
        return {
          ...track,
          playCount: stats?.count ?? 0,
          lastPlayedAt: stats?.lastPlayedAt?.toISOString() ?? null,
        };
      })
      // Never played sorts as the oldest; ties fall back to name.
      .sort(
        (a, b) =>
          lastPlayedMs(a) - lastPlayedMs(b) || a.name.localeCompare(b.name),
      );

    return { playlists, selectedPlaylist, datedTracks };
  } catch (error) {
    return {
      error: describeSpotifyError(error, "Unable to load your playlists."),
    };
  }
}

function lastPlayedMs(track: { lastPlayedAt: string | null }) {
  return track.lastPlayedAt ? new Date(track.lastPlayedAt).getTime() : 0;
}

function LastListenedShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Last listened</h1>
      </header>
      {children}
    </main>
  );
}

function LastListenedError({ message }: { message: string }) {
  return (
    <LastListenedShell>
      <div className="rounded-2xl border border-red-300/20 bg-red-300/5 p-6">
        <p className="text-red-200">{message}</p>
      </div>
    </LastListenedShell>
  );
}
