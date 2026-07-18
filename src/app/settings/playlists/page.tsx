import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PlaylistPreferences } from "@/components/playlist-preferences";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getCurrentSpotifyUser,
  getCurrentUserPlaylists,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

export default async function PlaylistSettings() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/");
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return (
      <SettingsShell>
        <p className="text-red-200">
          Sign out and reconnect Spotify to load your playlists.
        </p>
      </SettingsShell>
    );
  }

  const data = await loadPlaylistSettings(accessToken);

  if ("error" in data) {
    return (
      <SettingsShell>
        <p className="text-red-200">{data.error}</p>
      </SettingsShell>
    );
  }

  return (
    <SettingsShell>
      <PlaylistPreferences
        initialSelectedIds={data.initialSelectedIds}
        playlists={data.playlists}
      />
    </SettingsShell>
  );
}

async function loadPlaylistSettings(accessToken: string) {
  try {
    const [spotifyUser, allPlaylists, preferences] = await Promise.all([
      getCurrentSpotifyUser(accessToken),
      getCurrentUserPlaylists(accessToken),
      db.playlistPreference.findMany({
        orderBy: {
          position: "asc",
        },
      }),
    ]);
    const playlists = allPlaylists
      .filter((playlist) => playlist.owner?.id === spotifyUser.id)
      .map((playlist) => ({
        id: playlist.id,
        name: playlist.name,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const ownedIds = new Set(playlists.map((playlist) => playlist.id));
    const savedIds = preferences
      .map((preference) => preference.playlistId)
      .filter((playlistId) => ownedIds.has(playlistId));

    return {
      playlists,
      initialSelectedIds:
        savedIds.length > 0
          ? savedIds
          : playlists.map((playlist) => playlist.id),
    };
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to load playlist settings.",
    };
  }
}

function SettingsShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:py-16">
      <header className="mb-8 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1ed760]">
            Spotify Manager
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Playlist settings
          </h1>
          <p className="mt-2 text-sm text-[#a7b0aa]">
            Choose what appears in the dashboard and arrange its order.
          </p>
        </div>
        <Link
          className="text-sm text-[#a7b0aa] hover:text-white"
          href="/dashboard"
        >
          Dashboard
        </Link>
      </header>
      {children}
    </main>
  );
}
