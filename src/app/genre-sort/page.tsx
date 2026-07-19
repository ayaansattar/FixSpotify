import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { GenreSortFilters } from "@/components/genre-sort-filters";
import { GenreTrackList } from "@/components/genre-track-list";
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
  uri: string;
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
      pendingArtists: number;
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

  const { playlists, selectedPlaylist, tracks, pendingArtists } = data;
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

      {pendingArtists > 0 ? (
        <p className="mt-5 rounded-xl border border-[#1ed760]/20 bg-[#1ed760]/5 px-4 py-3 text-sm text-[#8cf0ae]">
          Genre data for {pendingArtists} artist
          {pendingArtists === 1 ? "" : "s"} is still being collected from
          MusicBrainz (its rate limit allows about one lookup per second).
          The background worker processes another batch every hour. Refresh
          later to see newly completed matches.
        </p>
      ) : null}

      <GenreTrackList tracks={tracks} />

      <p className="mt-5 text-xs leading-5 text-[#69736d]">
        Matches compare each track&apos;s artist genre tags (from the open
        MusicBrainz database) against your playlist names. Tracks marked
        &quot;No genre data&quot; have artists MusicBrainz hasn&apos;t tagged.
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
        pendingArtists: 0,
      };
    }

    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      selectedPlaylist.id,
    );
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );

    const artistRefs = uniqueTracks.flatMap((track) =>
      track.artists.map((artist) => ({ id: artist.id, name: artist.name })),
    );
    const { genresByArtist, pendingArtists } =
      await getGenresForArtists(artistRefs);

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
          uri: track.uri,
          name: track.name,
          artistNames: track.artists.map((artist) => artist.name).join(", "),
          genres,
          status,
          suggestion:
            status === "no-match"
              ? suggestPlaylist(genres, otherPlaylists)
              : null,
        };
      })
      .sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          a.name.localeCompare(b.name),
      );

    return { playlists, selectedPlaylist, tracks, pendingArtists };
  } catch (error) {
    return { error: describeSpotifyError(error, "Unable to analyze genres.") };
  }
}

function GenreSortShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Genre sort</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#a7b0aa]">
          Checks whether each track&apos;s genres fit the playlist it lives
          in, and suggests a better home when they don&apos;t.
        </p>
      </header>
      {children}
    </main>
  );
}
