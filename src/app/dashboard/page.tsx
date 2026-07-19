import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DashboardFilters } from "@/components/dashboard-filters";
import { RefreshButton } from "@/components/refresh-button";
import { TrackList } from "@/components/track-list";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import { getPreferredPlaylists } from "@/lib/playlists";
import {
  describeSpotifyError,
  type SpotifyPlaylist,
  type SpotifyPlaylistTrack,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

// days: 0 means lifetime (no date cutoff).
const windows = [
  { days: 183, label: "6 months" },
  { days: 365, label: "1 year" },
  { days: 0, label: "Lifetime" },
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
    redirect("/signin");
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
    : windows[0].days;

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
              {days === 0
                ? "Least listened across your full history"
                : `Least listened in the last ${
                    windows.find((window) => window.days === days)?.label
                  }`}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <RefreshButton playlistId={selectedPlaylist.id} />
            <p className="text-sm text-[#a7b0aa]">
              {rankedTracks.length} unique tracks
            </p>
          </div>
        </div>

        <TrackList
          initialTracks={rankedTracks}
          key={selectedPlaylist.id}
          playlistId={selectedPlaylist.id}
          playlistName={selectedPlaylist.name}
        />

        <p className="mt-5 text-xs leading-5 text-[#69736d]">
          Counts combine your imported Spotify extended history with the plays
          this app has synced since. Lifetime covers everything on record.
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
    const playlists = await getPreferredPlaylists(accessToken);
    const selectedPlaylist =
      playlists.find((playlist) => playlist.id === requestedPlaylistId) ??
      playlists[0] ??
      null;

    if (!selectedPlaylist) {
      return { playlists, selectedPlaylist: null, rankedTracks: [] };
    }

    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      selectedPlaylist.id,
    );
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );
    let since: Date | null = null;

    if (days > 0) {
      since = new Date();
      since.setDate(since.getDate() - days);
    }

    const countByTrack = await getPlayCounts(
      uniqueTracks.map((track) => ({
        id: track.id,
        name: track.name,
        artistIds: track.artists.map((artist) => artist.id).filter(Boolean),
      })),
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
    return { error: describeSpotifyError(error, "Unable to load your playlists.") };
  }
}

type CountableTrack = {
  id: string;
  name: string;
  artistIds: string[];
};

async function getPlayCounts(tracks: CountableTrack[], since: Date | null) {
  const countByTrack = new Map<string, number>();
  // SQLite limits query parameters (999 in Prisma's driver), so large
  // playlists must be counted in chunks.
  const chunkSize = 500;
  const trackIds = tracks.map((track) => track.id);

  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const playCounts = await db.play.groupBy({
      by: ["trackId"],
      where: {
        trackId: {
          in: chunk,
        },
        ...(since ? { playedAt: { gte: since } } : {}),
      },
      _count: {
        _all: true,
      },
    });

    for (const play of playCounts) {
      countByTrack.set(play.trackId, play._count._all);
    }
  }

  const unmatched = tracks.filter((track) => !countByTrack.has(track.id));

  if (unmatched.length === 0) {
    return countByTrack;
  }

  // Spotify assigns different track ids to the same song on different album
  // releases, so plays can be logged under an id that differs from the
  // playlist's version. Match zero-play tracks against history by name,
  // rejecting plays whose artist is known and doesn't match. (Imported
  // history rows have artistId "unknown" and match by name alone.)
  const playlistIds = new Set(trackIds);
  const countsByName = new Map<
    string,
    Array<{ artistId: string; count: number }>
  >();

  const nameTrackGroups = await db.play.groupBy({
    by: ["trackName", "trackId", "artistId"],
    where: since ? { playedAt: { gte: since } } : {},
    _count: { _all: true },
  });

  for (const group of nameTrackGroups) {
    // Plays under a playlist track's own id are already counted above.
    if (playlistIds.has(group.trackId)) {
      continue;
    }

    const key = normalizeTrackName(group.trackName);
    const entries = countsByName.get(key) ?? [];
    entries.push({ artistId: group.artistId, count: group._count._all });
    countsByName.set(key, entries);
  }

  for (const track of unmatched) {
    const candidates = countsByName.get(normalizeTrackName(track.name)) ?? [];
    const total = candidates
      .filter(
        (candidate) =>
          candidate.artistId === "unknown" ||
          track.artistIds.includes(candidate.artistId),
      )
      .reduce((sum, candidate) => sum + candidate.count, 0);

    if (total > 0) {
      countByTrack.set(track.id, total);
    }
  }

  return countByTrack;
}

function normalizeTrackName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
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
        <nav className="flex items-center gap-4 text-sm">
          <Link
            className="text-[#a7b0aa] hover:text-white"
            href="/settings/playlists"
          >
            Choose playlists
          </Link>
          <Link className="text-[#a7b0aa] hover:text-white" href="/shuffle">
            Fair shuffle
          </Link>
          <Link className="text-[#a7b0aa] hover:text-white" href="/genre-sort">
            Genre sort
          </Link>
          <Link
            className="text-[#a7b0aa] hover:text-white"
            href="/recently-deleted"
          >
            Recently deleted
          </Link>
          <Link className="text-[#a7b0aa] hover:text-white" href="/">
            Home
          </Link>
        </nav>
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
