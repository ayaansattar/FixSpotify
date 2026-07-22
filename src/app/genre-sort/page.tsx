import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { GenreSortFilters } from "@/components/genre-sort-filters";
import { GenreTrackList } from "@/components/genre-track-list";
import { authOptions } from "@/lib/auth";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import {
  getPreferredSortPlaylists,
  loadAnalyzedTracks,
} from "@/lib/playlist-sort";
import { getPreferredPlaylists } from "@/lib/playlists";
import {
  describeSpotifyError,
  type SpotifyPlaylist,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

type GenreSortPageProps = {
  searchParams: Promise<{
    playlist?: string;
  }>;
};

type GenreSortData =
  | { error: string }
  | {
      playlists: SpotifyPlaylist[];
      selectedPlaylist: SpotifyPlaylist | null;
      tracks: Awaited<ReturnType<typeof loadAnalyzedTracks>>["tracks"];
      pendingCount: number;
    };

export default async function GenreSortPage({
  searchParams,
}: GenreSortPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return (
      <GenreSortShell>
        <p className="text-red-200">
          Sign out and reconnect Spotify to analyze playlists.
        </p>
      </GenreSortShell>
    );
  }

  const params = await searchParams;
  const data = await loadGenreSortData(accessToken, params.playlist);

  if ("error" in data) {
    return (
      <GenreSortShell>
        <div className="rounded-2xl border border-red-300/20 bg-red-300/5 p-6">
          <p className="text-red-200">{data.error}</p>
        </div>
      </GenreSortShell>
    );
  }

  if (!data.selectedPlaylist) {
    return (
      <GenreSortShell>
        <p className="text-[#a7b0aa]">
          No playlists selected.{" "}
          <Link className="text-[#1ed760]" href="/settings/playlists">
            Choose playlists
          </Link>{" "}
          first.
        </p>
      </GenreSortShell>
    );
  }

  const { playlists, selectedPlaylist, tracks, pendingCount } = data;
  const matchCount = tracks.filter((track) => track.status === "match").length;
  const noMatchCount = tracks.filter(
    (track) => track.status === "no-match",
  ).length;

  return (
    <GenreSortShell>
      <GenreSortFilters
        pendingCount={pendingCount}
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
            {matchCount} belong, {noMatchCount} possible misfit
            {noMatchCount === 1 ? "" : "s"}, {pendingCount} need AI ·{" "}
            {tracks.length} tracks
          </p>
        </div>
        <Link
          className="text-sm text-[#1ed760] hover:underline"
          href="/settings/playlists"
        >
          Edit playlist intents
        </Link>
      </div>

      {!process.env.GEMINI_API_KEY ? (
        <p className="mt-5 rounded-xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">
          Add <code className="text-amber-50">GEMINI_API_KEY</code> to your{" "}
          <code className="text-amber-50">.env</code> (free from Google AI
          Studio) to analyze tracks that still need AI.
        </p>
      ) : null}

      <GenreTrackList playlistId={selectedPlaylist.id} tracks={tracks} />

      <p className="mt-5 text-xs leading-5 text-[#69736d]">
        Sorting uses your playlist intent descriptions, artist-cohesion
        (majority playlist wins), Gemini for the rest, and any &quot;keep here
        because…&quot; notes you save. Notes override the model for that track.
      </p>
    </GenreSortShell>
  );
}

async function loadGenreSortData(
  accessToken: string,
  requestedPlaylistId: string | undefined,
): Promise<GenreSortData> {
  try {
    const playlists = await getPreferredPlaylists(accessToken);
    const selectedPlaylist =
      playlists.find((playlist) => playlist.id === requestedPlaylistId) ??
      playlists[0] ??
      null;

    if (!selectedPlaylist) {
      return {
        playlists,
        selectedPlaylist: null,
        tracks: [],
        pendingCount: 0,
      };
    }

    const sortPlaylists = await getPreferredSortPlaylists(playlists);
    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      selectedPlaylist.id,
    );
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );

    const { tracks, pendingCount } = await loadAnalyzedTracks({
      accessToken,
      sourcePlaylistId: selectedPlaylist.id,
      playlists: sortPlaylists,
      tracks: uniqueTracks,
    });

    return { playlists, selectedPlaylist, tracks, pendingCount };
  } catch (error) {
    return {
      error: describeSpotifyError(error, "Unable to analyze playlist."),
    };
  }
}

function GenreSortShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Playlist sort</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#a7b0aa]">
          Checks whether each track fits the playlist&apos;s intent, keeps
          artists together when most of their songs already live in one place,
          and suggests a better home when they don&apos;t.
        </p>
      </header>
      {children}
    </main>
  );
}
