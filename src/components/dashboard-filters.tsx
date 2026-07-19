"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Dropdown } from "@/components/dropdown";

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
        <div className="grid gap-2 text-sm font-medium">
          Playlist
          <Dropdown
            disabled={isPending}
            onChange={(playlistId) => navigate(playlistId, days)}
            options={playlists.map((playlist) => ({
              value: playlist.id,
              label: playlist.name,
            }))}
            value={selectedPlaylistId}
          />
        </div>

        <div className="grid gap-2 text-sm font-medium">
          Listening window
          <Dropdown
            disabled={isPending}
            onChange={(selectedDays) =>
              navigate(selectedPlaylistId, Number(selectedDays))
            }
            options={windows.map((window) => ({
              value: String(window.days),
              label: window.label,
            }))}
            value={String(days)}
          />
        </div>
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
