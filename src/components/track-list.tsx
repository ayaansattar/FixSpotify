"use client";

import { useState } from "react";

type RankedTrack = {
  id: string;
  name: string;
  uri: string;
  isPlayable: boolean;
  availabilityReason?: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
  playCount: number;
};

type TrackListProps = {
  playlistId: string;
  playlistName: string;
  initialTracks: RankedTrack[];
};

type Notice = {
  kind: "error" | "success";
  text: string;
};

export function TrackList({
  playlistId,
  playlistName,
  initialTracks,
}: TrackListProps) {
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function play(track: RankedTrack) {
    if (!track.isPlayable) {
      return;
    }

    setPendingTrackId(track.id);
    setNotice(null);

    try {
      const response = await fetch("/api/playback", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackUri: track.uri }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to start playback.");
      }

      setPlayingTrackId(track.id);
      setNotice({ kind: "success", text: `Playing “${track.name}”.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to start playback.",
      });
    } finally {
      setPendingTrackId(null);
    }
  }

  async function remove(track: RankedTrack) {
    const confirmed = window.confirm(
      `Remove “${track.name}” from this playlist?\n\nThis removes every occurrence of the track and cannot be undone from this app.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingTrackId(track.id);
    setNotice(null);

    try {
      const response = await fetch(
        `/api/playlists/${encodeURIComponent(playlistId)}/items`,
        {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artistNames: track.artists
              .map((artist) => artist.name)
              .join(", "),
            playlistName,
            trackId: track.id,
            trackName: track.name,
            trackUri: track.uri,
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        warning?: string;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to remove the track.");
      }

      setTracks((current) =>
        current.filter((currentTrack) => currentTrack.id !== track.id),
      );
      setNotice({
        kind: "success",
        text:
          result.warning ??
          `Removed “${track.name}” and added it to Recently Deleted.`,
      });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to remove the track.",
      });
    } finally {
      setPendingTrackId(null);
    }
  }

  if (tracks.length === 0) {
    return (
      <p className="mt-5 rounded-2xl border border-white/10 p-6 text-[#a7b0aa]">
        This playlist has no available tracks.
      </p>
    );
  }

  return (
    <>
      {notice ? (
        <p
          aria-live="polite"
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            notice.kind === "error"
              ? "border-red-300/20 bg-red-300/5 text-red-200"
              : "border-[#1ed760]/20 bg-[#1ed760]/5 text-[#8cf0ae]"
          }`}
        >
          {notice.text}
        </p>
      ) : null}

      <ol className="mt-5 overflow-hidden rounded-2xl border border-white/10">
        {tracks.map((track, index) => {
          const pending = pendingTrackId === track.id;

          return (
            <li
              className={`grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-4 transition-colors last:border-b-0 ${
                track.isPlayable
                  ? "hover:bg-white/[0.03]"
                  : "bg-red-300/[0.025]"
              }`}
              key={track.id}
            >
              <span className="text-sm tabular-nums text-[#69736d]">
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate font-medium">{track.name}</p>
                <p className="truncate text-sm text-[#a7b0aa]">
                  {track.artists.map((artist) => artist.name).join(", ")}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-sm tabular-nums ${
                    track.playCount === 0
                      ? "border border-amber-300/25 bg-amber-300/10 text-amber-200"
                      : "bg-white/10"
                  }`}
                >
                  {track.playCount === 0
                    ? "Never played"
                    : `${track.playCount} ${track.playCount === 1 ? "play" : "plays"}`}
                </span>
                {track.isPlayable ? (
                  <button
                    className="cursor-pointer rounded-full border border-[#1ed760]/30 px-3 py-1 text-sm text-[#1ed760] hover:bg-[#1ed760]/10 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={pending}
                    onClick={() => void play(track)}
                    type="button"
                  >
                    {pending
                      ? "Working…"
                      : playingTrackId === track.id
                        ? "Playing"
                        : "Play"}
                  </button>
                ) : (
                  <span
                    className="rounded-full border border-red-300/25 bg-red-300/10 px-3 py-1 text-sm text-red-200"
                    title={
                      track.availabilityReason
                        ? `Spotify restriction: ${track.availabilityReason}`
                        : "This track is unavailable for playback."
                    }
                  >
                    Unavailable
                  </span>
                )}
                <a
                  className="rounded-full border border-white/15 px-3 py-1 text-sm text-[#a7b0aa] hover:bg-white/10 hover:text-white"
                  href={`https://open.spotify.com/track/${track.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
                <button
                  className="cursor-pointer rounded-full px-3 py-1 text-sm text-red-300 hover:bg-red-300/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  onClick={() => void remove(track)}
                  type="button"
                >
                  Remove
                </button>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
