"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

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
      <label className="grid gap-2 text-sm font-medium">
        Playlist
        <select
          className="min-w-0 rounded-xl border border-white/15 bg-[#111713] px-4 py-3 text-white disabled:opacity-60"
          disabled={isPending}
          onChange={(event) =>
            startTransition(() => {
              router.push(
                `/genre-sort?playlist=${encodeURIComponent(event.target.value)}`,
              );
            })
          }
          value={selectedPlaylistId}
        >
          {playlists.map((playlist) => (
            <option key={playlist.id} value={playlist.id}>
              {playlist.name}
            </option>
          ))}
        </select>
      </label>

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
