"use client";

import { useMemo, useState } from "react";

import { AlbumCover } from "@/components/album-cover";
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
  imageUrl?: string | null;
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
  const [masterMix, setMasterMix] = useState(false);
  const [playlistId, setPlaylistId] = useState(initialPlaylistId);
  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    playlists.map((playlist) => playlist.id),
  );
  const [mode, setMode] = useState<"deck" | "fresh" | "weighted">("deck");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ShuffleResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activePlaylistIds = masterMix ? selectedIds : [playlistId];
  const selectedName = masterMix
    ? selectedIds.length === playlists.length
      ? "all preferred playlists"
      : selectedIds.length === 1
        ? (playlists.find((playlist) => playlist.id === selectedIds[0])?.name ??
          "1 playlist")
        : `${selectedIds.length} playlists`
    : (playlists.find((playlist) => playlist.id === playlistId)?.name ??
      "playlist");

  function clearResult() {
    setResult(null);
    setError(null);
  }

  function togglePlaylist(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) {
        return current.filter((currentId) => currentId !== id);
      }

      return [...current, id];
    });
    clearResult();
  }

  async function runShuffle(reset = false) {
    if (activePlaylistIds.length === 0) {
      setError("Select at least one playlist.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/shuffle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode,
          playlistIds: activePlaylistIds,
          play: true,
          reset,
        }),
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

  return (
    <div className="space-y-6">
      <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-5">
        <div className="flex items-center justify-between gap-4 text-sm font-medium">
          <span>
            Master mix
            <span className="mt-1 block font-normal text-[#a7b0aa]">
              Combine songs from multiple playlists into one shuffle.
            </span>
          </span>
          <button
            aria-checked={masterMix}
            aria-label="Master mix"
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              masterMix ? "bg-[#1ed760]" : "bg-white/20"
            }`}
            disabled={loading}
            onClick={() => {
              setMasterMix((current) => !current);
              clearResult();
            }}
            role="switch"
            type="button"
          >
            <span
              aria-hidden
              className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                masterMix ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {masterMix ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-medium">
                Playlists ({selectedIds.length}/{playlists.length})
              </span>
              <div className="flex gap-3">
                <button
                  className="cursor-pointer text-[#1ed760] hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || selectedIds.length === playlists.length}
                  onClick={() => {
                    setSelectedIds(playlists.map((playlist) => playlist.id));
                    clearResult();
                  }}
                  type="button"
                >
                  Select all
                </button>
                <button
                  className="cursor-pointer text-[#a7b0aa] hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || selectedIds.length === 0}
                  onClick={() => {
                    setSelectedIds([]);
                    clearResult();
                  }}
                  type="button"
                >
                  Clear
                </button>
              </div>
            </div>
            <ul className="max-h-56 overflow-y-auto rounded-xl border border-white/10">
              {playlists.map((playlist) => {
                const checked = selectedSet.has(playlist.id);

                return (
                  <li
                    className="border-b border-white/10 last:border-b-0"
                    key={playlist.id}
                  >
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-white/5">
                      <input
                        checked={checked}
                        className="h-4 w-4 accent-[#1ed760]"
                        disabled={loading}
                        onChange={() => togglePlaylist(playlist.id)}
                        type="checkbox"
                      />
                      <span className="min-w-0 truncate">{playlist.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <div className="grid gap-2 text-sm font-medium">
            Playlist
            <Dropdown
              disabled={loading}
              onChange={(nextPlaylistId) => {
                setPlaylistId(nextPlaylistId);
                clearResult();
              }}
              options={playlists.map((playlist) => ({
                value: playlist.id,
                label: playlist.name,
              }))}
              value={playlistId}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
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
                clearResult();
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
            disabled={loading || activePlaylistIds.length === 0}
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
            disabled={loading || activePlaylistIds.length === 0}
            onClick={() => void runShuffle(mode === "deck")}
            type="button"
          >
            {mode === "deck" ? "Restart deck" : "Re-shuffle"}
          </button>
        </div>
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
                className="grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
                key={`${track.position}-${track.id}`}
              >
                <span className="text-sm tabular-nums text-[#69736d]">
                  {track.position}
                </span>
                <AlbumCover url={track.imageUrl} />
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
