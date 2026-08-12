"use client";

import { useMemo, useState } from "react";

import { ColorArchiveList } from "@/components/color-archive-list";

type DeletedTrack = {
  id: string;
  playlistName: string;
  trackId: string;
  trackName: string;
  artistNames: string;
  trackUri: string;
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
  const [queuedTrackId, setQueuedTrackId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "play" | "queue" | "restore" | null
  >(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const archiveItems = useMemo(
    () =>
      tracks.map((track) => ({
        id: track.id,
        title: track.trackName,
        subtitle: track.artistNames || "Unknown artist",
        badge: track.playlistName,
        imageUrl: track.albumImageUrl,
        colorKey: track.artistNames || track.trackName,
      })),
    [tracks],
  );

  async function playTrack(track: DeletedTrack) {
    setPendingId(track.id);
    setPendingAction("play");
    setNotice(null);

    try {
      const response = await fetch("/api/playback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUri: track.trackUri }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to start playback.");
      }
      setPlayingTrackId(track.id);
      setNotice({ kind: "success", text: `Playing “${track.trackName}”.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to start playback.",
      });
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  }

  async function queueTrack(track: DeletedTrack) {
    setPendingId(track.id);
    setPendingAction("queue");
    setNotice(null);

    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUri: track.trackUri }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error ?? "Unable to add the track to the queue.");
      }
      setQueuedTrackId(track.id);
      setNotice({ kind: "success", text: `Queued “${track.trackName}”.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to add the track to the queue.",
      });
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  }

  async function restore(track: DeletedTrack) {
    setPendingId(track.id);
    setPendingAction("restore");
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
      setPendingAction(null);
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

      <ColorArchiveList
        items={archiveItems}
        renderActivePanel={(item) => {
          const track = tracks.find((candidate) => candidate.id === item.id);
          if (!track) {
            return null;
          }
          const pending = pendingId === track.id;

          return (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-black/60">
                {formatDeletedAt(track.deletedAt)}
              </span>
              <button
                className="cursor-pointer rounded-full border border-black/20 bg-black/10 px-3 py-1 text-sm font-semibold text-black hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={() => void playTrack(track)}
                type="button"
              >
                {pending && pendingAction === "play"
                  ? "Working…"
                  : playingTrackId === track.id
                    ? "Playing"
                    : "Play"}
              </button>
              <button
                className="cursor-pointer rounded-full border border-black/15 px-3 py-1 text-sm text-black/70 hover:bg-black/10 hover:text-black disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={() => void queueTrack(track)}
                type="button"
              >
                {pending && pendingAction === "queue"
                  ? "Queuing…"
                  : queuedTrackId === track.id
                    ? "Queued"
                    : "Queue"}
              </button>
              <a
                className="rounded-full border border-black/15 px-3 py-1 text-sm text-black/70 hover:bg-black/10 hover:text-black"
                href={`https://open.spotify.com/track/${track.trackId}`}
                rel="noreferrer"
                target="_blank"
              >
                Open
              </a>
              <button
                className="cursor-pointer rounded-full border border-black/20 bg-black/10 px-3 py-1 text-sm font-semibold text-black hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={pending}
                onClick={() => void restore(track)}
                type="button"
              >
                {pending && pendingAction === "restore"
                  ? "Restoring…"
                  : "Restore"}
              </button>
            </div>
          );
        }}
      />
    </>
  );
}

function formatDeletedAt(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
