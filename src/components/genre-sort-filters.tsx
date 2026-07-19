"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Dropdown } from "@/components/dropdown";

type PlaylistOption = {
  id: string;
  name: string;
};

type GenreSortFiltersProps = {
  playlists: PlaylistOption[];
  selectedPlaylistId: string;
};

export function GenreSortFilters({
  playlists,
  selectedPlaylistId,
}: GenreSortFiltersProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
      <div className="grid gap-2 text-sm font-medium">
        Playlist
        <Dropdown
          disabled={isPending}
          onChange={(playlistId) =>
            startTransition(() => {
              router.push(
                `/genre-sort?playlist=${encodeURIComponent(playlistId)}`,
              );
            })
          }
          options={playlists.map((playlist) => ({
            value: playlist.id,
            label: playlist.name,
          }))}
          value={selectedPlaylistId}
        />
      </div>

      {isPending ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-[#a7b0aa]">
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1ed760] border-t-transparent" />
          Loading tracks and artist genres… the first visit to a playlist can
          take a little while.
        </p>
      ) : null}
    </div>
  );
}
