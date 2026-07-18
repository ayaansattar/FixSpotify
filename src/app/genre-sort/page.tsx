import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { GenreSortFilters } from "@/components/genre-sort-filters";
import { authOptions } from "@/lib/auth";
import {
  getGenresForArtists,
  MATCH_THRESHOLD,
  scorePlaylistMatch,
  suggestPlaylist,
  type PlaylistSuggestion,
} from "@/lib/genres";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
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

type MatchStatus = "match" | "no-match" | "unknown";

type AnalyzedTrack = {
  id: string;
  name: string;
  artistNames: string;
  genres: string[];
  status: MatchStatus;
  suggestion: PlaylistSuggestion | null;
};

type GenreSortData =
  | { error: string }
  | {
      playlists: SpotifyPlaylist[];
      selectedPlaylist: SpotifyPlaylist | null;
      tracks: AnalyzedTrack[];
    };

const statusRank: Record<MatchStatus, number> = {
  "no-match": 0,
  unknown: 1,
  match: 2,
};

export default async function GenreSortPage({
  searchParams,
}: GenreSortPageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
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

  const { playlists, selectedPlaylist, tracks } = data;
  const matchCount = tracks.filter((track) => track.status === "match").length;
  const noMatchCount = tracks.filter(
    (track) => track.status === "no-match",
  ).length;

  return (
    <GenreSortShell>
      <GenreSortFilters
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
            {matchCount} match{matchCount === 1 ? "" : "es"}, {noMatchCount}{" "}
            possible misfit{noMatchCount === 1 ? "" : "s"} of {tracks.length}{" "}
            tracks
          </p>
        </div>
      </div>

      <ul className="mt-5 space-y-3">
        {tracks.map((track) => (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 px-5 py-4"
            key={track.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{track.name}</p>
              <p className="truncate text-sm text-[#a7b0aa]">
                {track.artistNames}
              </p>
              {track.genres.length > 0 ? (
                <p className="mt-1 truncate text-xs text-[#69736d]">
                  {track.genres.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col items-end gap-1">
              <StatusBadge status={track.status} />
              {track.suggestion &&
              track.suggestion.playlistId !== selectedPlaylist.id ? (
                <p className="text-xs text-[#a7b0aa]">
                  Fits{" "}
                  <span className="font-semibold text-white">
                    {track.suggestion.playlistName}
                  </span>
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-5 text-xs leading-5 text-[#69736d]">
        Matches compare each track&apos;s artist genres (from Spotify) against
        your playlist names. Tracks marked &quot;No genre data&quot; have
        artists Spotify hasn&apos;t tagged with genres.
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
      return { playlists, selectedPlaylist: null, tracks: [] };
    }

    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      selectedPlaylist.id,
    );
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );

    const artistIds = uniqueTracks.flatMap((track) =>
      track.artists.map((artist) => artist.id).filter(Boolean),
    );
    const genresByArtist = await getGenresForArtists(accessToken, artistIds);

    const otherPlaylists = playlists
      .filter((playlist) => playlist.id !== selectedPlaylist.id)
      .map((playlist) => ({ id: playlist.id, name: playlist.name }));

    const tracks = uniqueTracks
      .map((track): AnalyzedTrack => {
        const genres = Array.from(
          new Set(
            track.artists.flatMap(
              (artist) => genresByArtist.get(artist.id) ?? [],
            ),
          ),
        );
        const status: MatchStatus =
          genres.length === 0
            ? "unknown"
            : scorePlaylistMatch(genres, selectedPlaylist.name) >=
                MATCH_THRESHOLD
              ? "match"
              : "no-match";

        return {
          id: track.id,
          name: track.name,
          artistNames: track.artists.map((artist) => artist.name).join(", "),
          genres,
          status,
          suggestion: suggestPlaylist(genres, otherPlaylists),
        };
      })
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          a.name.localeCompare(b.name),
      );

    return { playlists, selectedPlaylist, tracks };
  } catch (error) {
    return { error: describeSpotifyError(error, "Unable to analyze genres.") };
  }
}

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === "match") {
    return (
      <span className="rounded-full border border-[#1ed760]/30 bg-[#1ed760]/10 px-3 py-1 text-xs font-semibold text-[#1ed760]">
        Match
      </span>
    );
  }

  if (status === "no-match") {
    return (
      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
        No match
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-[#a7b0aa]">
      No genre data
    </span>
  );
}

function GenreSortShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1ed760]">
            Spotify Manager
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Genre sort
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#a7b0aa]">
            Checks whether each track&apos;s genres fit the playlist it lives
            in, and suggests a better home when they don&apos;t.
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link className="text-[#a7b0aa] hover:text-white" href="/dashboard">
            Dashboard
          </Link>
          <Link className="text-[#a7b0aa] hover:text-white" href="/shuffle">
            Fair shuffle
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
