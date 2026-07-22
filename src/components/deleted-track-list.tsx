"use client";

import { useState } from "react";

import { AlbumCover } from "@/components/album-cover";

type DeletedTrack = {
  id: string;
  playlistName: string;
  trackId: string;
  trackName: string;
  artistNames: string;
  albumImageUrl: string | null;
  deletedAt: string;
};

type DeletedTrackListProps = {
  initialTracks: DeletedTrack[];
};

type Notice = {
  kind: "error" | "success";
  text: string;
};

export function DeletedTrackList({ initialTracks }: DeletedTrackListProps) {
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function restore(track: DeletedTrack) {
    setPendingId(track.id);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/recently-deleted/${encodeURIComponent(track.id)}/restore`,
        {
          method: "POST",
        },
      );
      const result = (await response.json()) as {
        alreadyPresent?: boolean;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to restore the track.");
      }

      setTracks((current) =>
        current.filter((currentTrack) => currentTrack.id !== track.id),
      );
      setNotice({
        kind: "success",
        text: result.alreadyPresent
          ? `“${track.trackName}” was already in ${track.playlistName}, so no duplicate was added.`
          : `Restored “${track.trackName}” to ${track.playlistName}. It was added to the end of the playlist.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to restore the track.",
      });
    } finally {
      setPendingId(null);
    }
  }

  if (tracks.length === 0) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
        <p className="text-[#a7b0aa]">
          Tracks you remove from a playlist will appear here for seven days.
        </p>
      </div>
    );
  }

  return (
    <>
      {notice ? (
        <p
          aria-live="polite"
          className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
            notice.kind === "error"
              ? "border-red-300/20 bg-red-300/5 text-red-200"
              : "border-[#1ed760]/20 bg-[#1ed760]/5 text-[#8cf0ae]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <ol className="overflow-hidden rounded-2xl border border-white/10">
        {tracks.map((track, index) => {
          const pending = pendingId === track.id;

          return (
            <li
              className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-4 transition-colors last:border-b-0 hover:bg-white/[0.03]"
              key={track.id}
            >
              <span className="text-sm tabular-nums text-[#69736d]">
                {index + 1}
              </span>
              <AlbumCover url={track.albumImageUrl} />
              <div className="min-w-0">
                <p className="truncate font-medium">{track.trackName}</p>
                <p className="truncate text-sm text-[#a7b0aa]">
                  {track.artistNames || "Unknown artist"} · {track.playlistName}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-3">
                <span className="text-xs text-[#69736d]">
                  {formatDeletedAt(track.deletedAt)}
                </span>
                <a
                  className="text-sm text-[#a7b0aa] hover:text-white"
                  href={`https://open.spotify.com/track/${track.trackId}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
                <button
                  className="cursor-pointer rounded-full border border-[#1ed760]/40 px-3 py-1 text-sm text-[#8cf0ae] hover:bg-[#1ed760]/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  onClick={() => void restore(track)}
                  type="button"
                >
                  {pending ? "Restoring…" : "Restore"}
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

function formatDeletedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
