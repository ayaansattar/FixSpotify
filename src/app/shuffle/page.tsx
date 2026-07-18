import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ShufflePanel } from "@/components/shuffle-panel";
import { authOptions } from "@/lib/auth";
import { getPreferredPlaylists } from "@/lib/playlists";
import { describeSpotifyError } from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

type ShufflePageProps = {
  searchParams: Promise<{
    playlist?: string;
  }>;
};

export default async function ShufflePage({ searchParams }: ShufflePageProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return (
      <ShuffleShell>
        <p className="text-red-200">
          Sign out and reconnect Spotify to shuffle playlists.
        </p>
      </ShuffleShell>
    );
  }

  const params = await searchParams;
  const data = await loadShufflePlaylists(accessToken);

  if ("error" in data) {
    return (
      <ShuffleShell>
        <p className="text-red-200">{data.error}</p>
      </ShuffleShell>
    );
  }

  if (data.playlists.length === 0) {
    return (
      <ShuffleShell>
        <p className="text-[#a7b0aa]">
          No playlists selected.{" "}
          <Link className="text-[#1ed760]" href="/settings/playlists">
            Choose playlists
          </Link>{" "}
          first.
        </p>
      </ShuffleShell>
    );
  }

  const selectedPlaylist =
    data.playlists.find((playlist) => playlist.id === params.playlist) ??
    data.playlists[0];

  return (
    <ShuffleShell>
      <ShufflePanel
        initialPlaylistId={selectedPlaylist.id}
        playlists={data.playlists.map((playlist) => ({
          id: playlist.id,
          name: playlist.name,
        }))}
      />
    </ShuffleShell>
  );
}

async function loadShufflePlaylists(accessToken: string) {
  try {
    return { playlists: await getPreferredPlaylists(accessToken) };
  } catch (error) {
    return { error: describeSpotifyError(error, "Unable to load playlists.") };
  }
}

function ShuffleShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1ed760]">
            Spotify Manager
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Fair shuffle
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-[#a7b0aa]">
            Builds a uniform-random order with Fisher–Yates, turns off Spotify’s
            shuffle, and plays that exact sequence on your active device.
          </p>
        </div>
        <nav className="flex items-center gap-4 text-sm">
          <Link className="text-[#a7b0aa] hover:text-white" href="/dashboard">
            Dashboard
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
