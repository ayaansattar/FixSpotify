"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type PlaylistOption = {
  id: string;
  name: string;
};

type WindowOption = {
  days: number;
  label: string;
};

type DashboardFiltersProps = {
  playlists: PlaylistOption[];
  selectedPlaylistId: string;
  days: number;
  windows: readonly WindowOption[];
};

export function DashboardFilters({
  playlists,
  selectedPlaylistId,
  days,
  windows,
}: DashboardFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function navigate(playlistId: string, selectedDays: number) {
    startTransition(() => {
      router.push(
        `/dashboard?playlist=${encodeURIComponent(playlistId)}&days=${selectedDays}`,
      );
    });
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
        <label className="grid gap-2 text-sm font-medium">
          Playlist
          <select
            className="min-w-0 rounded-xl border border-white/15 bg-[#111713] px-4 py-3 text-white disabled:opacity-60"
            disabled={isPending}
            onChange={(event) => navigate(event.target.value, days)}
            value={selectedPlaylistId}
          >
            {playlists.map((playlist) => (
              <option key={playlist.id} value={playlist.id}>
                {playlist.name}
              </option>
            ))}
          </select>
        </label>

        <label className="grid gap-2 text-sm font-medium">
          Listening window
          <select
            className="rounded-xl border border-white/15 bg-[#111713] px-4 py-3 text-white disabled:opacity-60"
            disabled={isPending}
            onChange={(event) =>
              navigate(selectedPlaylistId, Number(event.target.value))
            }
            value={days}
          >
            {windows.map((window) => (
              <option key={window.days} value={window.days}>
                {window.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[#a7b0aa]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1ed760] border-t-transparent" />
          Loading playlist from Spotify… large playlists can take a few
          seconds.
        </p>
      ) : null}
    </div>
  );
}
