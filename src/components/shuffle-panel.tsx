"use client";

import { useState } from "react";

import { Dropdown } from "@/components/dropdown";

type PlaylistOption = {
  id: string;
  name: string;
};

type ShuffledTrack = {
  position: number;
  id: string;
  name: string;
  uri: string;
  artists: string;
  playCount?: number;
};

type ShuffleResult = {
  mode: "deck" | "fresh" | "weighted";
  remaining: number;
  total: number;
  playingCount: number;
  tracks: ShuffledTrack[];
};

type ShufflePanelProps = {
  playlists: PlaylistOption[];
  initialPlaylistId: string;
};

export function ShufflePanel({
  playlists,
  initialPlaylistId,
}: ShufflePanelProps) {
  const [playlistId, setPlaylistId] = useState(initialPlaylistId);
  const [mode, setMode] = useState<"deck" | "fresh" | "weighted">("deck");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShuffleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runShuffle(reset = false) {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/shuffle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ mode, playlistId, play: true, reset }),
      });
      const body = (await response.json()) as ShuffleResult & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to shuffle playlist.");
      }

      setResult(body);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Unable to shuffle playlist.");
    } finally {
      setLoading(false);
    }
  }

  const selectedName =
    playlists.find((playlist) => playlist.id === playlistId)?.name ??
    "playlist";

  return (
    <div className="space-y-6">
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:grid-cols-[1fr_13rem_auto_auto] sm:items-end">
        <div className="grid gap-2 text-sm font-medium">
          Playlist
          <Dropdown
            disabled={loading}
            onChange={(nextPlaylistId) => {
              setPlaylistId(nextPlaylistId);
              setResult(null);
              setError(null);
            }}
            options={playlists.map((playlist) => ({
              value: playlist.id,
              label: playlist.name,
            }))}
            value={playlistId}
          />
        </div>

        <div className="grid gap-2 text-sm font-medium">
          Shuffle mode
          <Dropdown
            disabled={loading}
            onChange={(nextMode) => {
              setMode(
                nextMode === "fresh" || nextMode === "weighted"
                  ? nextMode
                  : "deck",
              );
              setResult(null);
              setError(null);
            }}
            options={[
              { value: "deck", label: "No-repeat deck" },
              { value: "fresh", label: "Fresh random" },
              { value: "weighted", label: "Favor least listened" },
            ]}
            value={mode}
          />
        </div>

        <button
          className="cursor-pointer rounded-xl bg-[#1ed760] px-5 py-3 font-semibold text-[#07150c] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={() => void runShuffle()}
          type="button"
        >
          {loading
            ? "Shuffling…"
            : mode === "deck" && result
              ? "Next batch"
              : "Shuffle & play"}
        </button>

        <button
          className="cursor-pointer rounded-xl border border-white/15 px-5 py-3 font-semibold hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={() => void runShuffle(mode === "deck")}
          type="button"
        >
          {mode === "deck" ? "Restart deck" : "Re-shuffle"}
        </button>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-300/20 bg-red-300/5 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      {result ? (
        <>
          <div className="rounded-2xl border border-[#1ed760]/20 bg-[#1ed760]/5 px-5 py-4 text-sm text-[#8cf0ae]">
            {result.mode === "deck" ? (
              <>
                <p>
                  Playing {result.playingCount} random, not-yet-dealt tracks
                  from {selectedName}.
                </p>
                <p className="mt-2 text-[#a7b0aa]">
                  {result.remaining > 0
                    ? `${result.remaining} tracks remain before the deck resets.`
                    : "The deck is empty. Next batch starts a new random cycle."}
                </p>
              </>
            ) : result.mode === "weighted" ? (
              <>
                <p>
                  Playing a least-listened weighted order from {selectedName}.
                </p>
                <p className="mt-2 text-[#a7b0aa]">
                  Tracks with fewer lifetime plays are more likely to appear
                  earlier, while every playable track remains eligible.
                </p>
              </>
            ) : (
              <p>
                Fair-shuffled {result.total} tracks from {selectedName}. Now
                playing the first {result.playingCount} in exact shuffled order.
              </p>
            )}
            {result.mode !== "deck" &&
            result.total > result.playingCount ? (
              <p className="mt-2 text-[#a7b0aa]">
                Spotify accepts at most {result.playingCount} tracks per play
                request, so playback covers the first {result.playingCount} of
                this order.
                {result.mode === "fresh"
                  ? " Every track had an equal chance at every position."
                  : " Re-shuffle anytime for a new weighted order."}
              </p>
            ) : null}
          </div>

          <ol className="overflow-hidden rounded-2xl border border-white/10">
            {result.tracks.slice(0, 100).map((track) => (
              <li
                className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
                key={`${track.position}-${track.id}`}
              >
                <span className="text-sm tabular-nums text-[#69736d]">
                  {track.position}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium">{track.name}</p>
                  <p className="truncate text-sm text-[#a7b0aa]">
                    {track.artists}
                    {typeof track.playCount === "number"
                      ? ` · ${track.playCount} lifetime ${
                          track.playCount === 1 ? "play" : "plays"
                        }`
                      : ""}
                  </p>
                </div>
                <a
                  className="text-sm text-[#a7b0aa] hover:text-white"
                  href={`https://open.spotify.com/track/${track.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
              </li>
            ))}
          </ol>

          {result.mode !== "deck" && result.tracks.length > 100 ? (
            <p className="text-sm text-[#69736d]">
              Showing the first 100 of {result.total} shuffled tracks.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
