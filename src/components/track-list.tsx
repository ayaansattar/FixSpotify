"use client";

import { useEffect, useState } from "react";

import { AlbumCover } from "@/components/album-cover";
import { Dropdown } from "@/components/dropdown";

type RankedTrack = {
  id: string;
  name: string;
  uri: string;
  isPlayable: boolean;
  availabilityReason?: string;
  imageUrl: string | null;
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
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setTracks(initialTracks);
    setFilter("all");
    setQuery("");
    setPendingTrackId(null);
    setPlayingTrackId(null);
    setNotice(null);
  }, [initialTracks]);

  const playBuckets = [
    { value: "1-2", label: "1–2 plays", matches: (count: number) => count >= 1 && count <= 2 },
    { value: "3-5", label: "3–5 plays", matches: (count: number) => count >= 3 && count <= 5 },
    { value: "6-10", label: "6–10 plays", matches: (count: number) => count >= 6 && count <= 10 },
    { value: "10+", label: "10+ plays", matches: (count: number) => count >= 10 },
    { value: "20+", label: "20+ plays", matches: (count: number) => count >= 20 },
    { value: "30+", label: "30+ plays", matches: (count: number) => count >= 30 },
  ];

  const filterOptions = [
    { value: "all", label: `All tracks (${tracks.length})` },
    {
      value: "unavailable",
      label: `Unavailable (${tracks.filter((track) => !track.isPlayable).length})`,
    },
    {
      value: "never",
      label: `Never played (${tracks.filter((track) => track.playCount === 0).length})`,
    },
    ...playBuckets
      .map((bucket) => ({
        value: bucket.value,
        label: `${bucket.label} (${
          tracks.filter((track) => bucket.matches(track.playCount)).length
        })`,
        count: tracks.filter((track) => bucket.matches(track.playCount)).length,
      }))
      .filter((option) => option.count > 0 || option.value === filter)
      .map(({ value, label }) => ({ value, label })),
  ];

  const activeBucket = playBuckets.find((bucket) => bucket.value === filter);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTracks = tracks.filter((track) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "unavailable"
          ? !track.isPlayable
          : filter === "never"
            ? track.playCount === 0
            : activeBucket
              ? activeBucket.matches(track.playCount)
              : true;
    const matchesSearch =
      !normalizedQuery ||
      track.name.toLowerCase().includes(normalizedQuery) ||
      track.artists.some((artist) =>
        artist.name.toLowerCase().includes(normalizedQuery),
      );

    return matchesFilter && matchesSearch;
  });

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
            albumImageUrl: track.imageUrl,
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

      <div className="mt-5 grid gap-3 sm:grid-cols-[minmax(0,1fr)_14rem]">
        <label className="relative block">
          <span className="sr-only">Search tracks or artists</span>
          <svg
            aria-hidden
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#69736d]"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            className="w-full rounded-xl border border-white/15 bg-[#111713] py-3 pl-11 pr-4 text-white placeholder:text-[#69736d] hover:border-white/30"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tracks or artists…"
            type="search"
            value={query}
          />
        </label>
        <div className="text-sm font-medium">
          <Dropdown
            onChange={setFilter}
            options={filterOptions}
            value={filter}
          />
        </div>
      </div>

      {filter !== "all" || normalizedQuery ? (
        <p className="mt-3 text-sm text-[#a7b0aa]">
          Showing {visibleTracks.length} of {tracks.length} tracks
        </p>
      ) : null}

      {visibleTracks.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-white/10 p-6 text-[#a7b0aa]">
          No tracks match your search and filter.
        </p>
      ) : (
      <ol className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        {visibleTracks.map((track, index) => {
          const pending = pendingTrackId === track.id;

          return (
            <li
              className={`grid grid-cols-[2.5rem_2.5rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 px-4 py-4 transition-colors last:border-b-0 ${
                track.isPlayable
                  ? "hover:bg-white/[0.03]"
                  : "bg-red-300/[0.025]"
              }`}
              key={track.id}
            >
              <span className="text-sm tabular-nums text-[#69736d]">
                {index + 1}
              </span>
              <AlbumCover url={track.imageUrl} />
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
      )}
    </>
  );
}
