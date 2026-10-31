"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";

import { ColorArchiveList } from "@/components/color-archive-list";
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
  /** ISO timestamp; only set by the last-listened view. */
  lastPlayedAt?: string | null;
};

type TrackListProps = {
  playlistId: string;
  playlistName: string;
  initialTracks: RankedTrack[];
  /** "plays" badges and filters by play count; "lastListened" by last play date. */
  variant?: "plays" | "lastListened";
};

type Bucket = {
  value: string;
  label: string;
  matches: (track: RankedTrack) => boolean;
};

const playBuckets: Bucket[] = [
  { value: "1-2", label: "1–2 plays", matches: ({ playCount }) => playCount >= 1 && playCount <= 2 },
  { value: "3-5", label: "3–5 plays", matches: ({ playCount }) => playCount >= 3 && playCount <= 5 },
  { value: "6-10", label: "6–10 plays", matches: ({ playCount }) => playCount >= 6 && playCount <= 10 },
  { value: "10+", label: "10+ plays", matches: ({ playCount }) => playCount >= 10 },
  { value: "20+", label: "20+ plays", matches: ({ playCount }) => playCount >= 20 },
  { value: "30+", label: "30+ plays", matches: ({ playCount }) => playCount >= 30 },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function daysSinceLastPlay(track: RankedTrack) {
  return track.lastPlayedAt
    ? (Date.now() - new Date(track.lastPlayedAt).getTime()) / DAY_MS
    : null;
}

function notHeardFor(days: number) {
  return (track: RankedTrack) => {
    const age = daysSinceLastPlay(track);
    return age !== null && age >= days;
  };
}

const ageBuckets: Bucket[] = [
  { value: "2y", label: "Not heard in 2+ years", matches: notHeardFor(730) },
  { value: "1y", label: "Not heard in 1+ year", matches: notHeardFor(365) },
  { value: "6m", label: "Not heard in 6+ months", matches: notHeardFor(183) },
  { value: "3m", label: "Not heard in 3+ months", matches: notHeardFor(91) },
  {
    value: "30d",
    label: "Heard in the last 30 days",
    matches: (track) => {
      const age = daysSinceLastPlay(track);
      return age !== null && age < 30;
    },
  },
];

function formatLastPlayed(value: string) {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(value),
  );
}

type Notice = {
  kind: "error" | "success";
  text: string;
};

export function TrackList({
  playlistId,
  playlistName,
  initialTracks,
  variant = "plays",
}: TrackListProps) {
  const buckets = variant === "lastListened" ? ageBuckets : playBuckets;
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingTrackId, setPendingTrackId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [queuedTrackId, setQueuedTrackId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<
    "play" | "queue" | "remove" | null
  >(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setTracks(initialTracks);
    setFilter("all");
    setQuery("");
    setPendingTrackId(null);
    setPlayingTrackId(null);
    setQueuedTrackId(null);
    setPendingAction(null);
    setNotice(null);
  }, [initialTracks]);

  // Memoized so unrelated state (pending/notice) doesn't hand the archive list
  // a new items array, which would re-render every row and redo color work.
  const filterOptions = useMemo(() => {
    const bucketCounts = buckets.map((bucket) => ({
      bucket,
      count: tracks.filter((track) => bucket.matches(track)).length,
    }));

    return [
      { value: "all", label: `All tracks (${tracks.length})` },
      {
        value: "unavailable",
        label: `Unavailable (${tracks.filter((track) => !track.isPlayable).length})`,
      },
      {
        value: "never",
        label: `Never played (${tracks.filter((track) => track.playCount === 0).length})`,
      },
      ...bucketCounts
        .filter(({ bucket, count }) => count > 0 || bucket.value === filter)
        .map(({ bucket, count }) => ({
          value: bucket.value,
          label: `${bucket.label} (${count})`,
        })),
    ];
  }, [tracks, filter, buckets]);

  // Typing stays responsive; the (large) list re-filters at lower priority.
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();
  const visibleTracks = useMemo(() => {
    const activeBucket = buckets.find((bucket) => bucket.value === filter);

    return tracks.filter((track) => {
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "unavailable"
            ? !track.isPlayable
            : filter === "never"
              ? track.playCount === 0
              : activeBucket
                ? activeBucket.matches(track)
                : true;
      const matchesSearch =
        !normalizedQuery ||
        track.name.toLowerCase().includes(normalizedQuery) ||
        track.artists.some((artist) =>
          artist.name.toLowerCase().includes(normalizedQuery),
        );

      return matchesFilter && matchesSearch;
    });
  }, [tracks, filter, normalizedQuery, buckets]);

  // One stable item object per track, so filtering reuses them instead of
  // giving every row new props.
  const itemsById = useMemo(
    () =>
      new Map(
        tracks.map(
          (track) =>
            [
              track.id,
              {
                id: track.id,
                title: track.name,
                subtitle:
                  track.artists.map((artist) => artist.name).join(", ") ||
                  "Unknown",
                badge:
                  track.playCount === 0
                    ? "Never played"
                    : variant === "lastListened" && track.lastPlayedAt
                      ? formatLastPlayed(track.lastPlayedAt)
                      : `${track.playCount} ${track.playCount === 1 ? "play" : "plays"}`,
                imageUrl: track.imageUrl,
                colorKey:
                  track.artists.map((artist) => artist.name).join(", ") ||
                  track.name,
              },
            ] as const,
        ),
      ),
    [tracks, variant],
  );
  const archiveItems = useMemo(
    () => visibleTracks.map((track) => itemsById.get(track.id)!),
    [visibleTracks, itemsById],
  );

  async function play(track: RankedTrack) {
    if (!track.isPlayable) {
      return;
    }

    setPendingTrackId(track.id);
    setPendingAction("play");
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
      setPendingAction(null);
    }
  }

  async function queue(track: RankedTrack) {
    if (!track.isPlayable) {
      return;
    }

    setPendingTrackId(track.id);
    setPendingAction("queue");
    setNotice(null);

    try {
      const response = await fetch("/api/queue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trackUri: track.uri }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to add the track to the queue.");
      }

      setQueuedTrackId(track.id);
      setNotice({ kind: "success", text: `Queued “${track.name}”.` });
    } catch (error) {
      setNotice({
        kind: "error",
        text:
          error instanceof Error
            ? error.message
            : "Unable to add the track to the queue.",
      });
    } finally {
      setPendingTrackId(null);
      setPendingAction(null);
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
    setPendingAction("remove");
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
      setPendingAction(null);
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
        <ColorArchiveList
          items={archiveItems}
          renderActivePanel={(item) => {
            const track = visibleTracks.find(
              (candidate) => candidate.id === item.id,
            );
            if (!track) {
              return null;
            }
            const pending = pendingTrackId === track.id;

            return (
              <div className="flex flex-wrap items-center gap-2">
                {track.isPlayable ? (
                  <>
                    <button
                      className="cursor-pointer rounded-full border border-black/20 bg-black/10 px-3 py-1 text-sm font-semibold text-black hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={pending}
                      onClick={() => void play(track)}
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
                      onClick={() => void queue(track)}
                      type="button"
                    >
                      {pending && pendingAction === "queue"
                        ? "Queuing…"
                        : queuedTrackId === track.id
                          ? "Queued"
                          : "Queue"}
                    </button>
                  </>
                ) : (
                  <span
                    className="rounded-full border border-red-900/30 bg-red-900/10 px-3 py-1 text-sm text-red-950"
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
                  className="rounded-full border border-black/15 px-3 py-1 text-sm text-black/70 hover:bg-black/10 hover:text-black"
                  href={`https://open.spotify.com/track/${track.id}`}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open
                </a>
                <button
                  className="cursor-pointer rounded-full px-3 py-1 text-sm text-red-900 hover:bg-red-900/10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={pending}
                  onClick={() => void remove(track)}
                  type="button"
                >
                  {pending && pendingAction === "remove" ? "Removing…" : "Remove"}
                </button>
              </div>
            );
          }}
        />
      )}
    </>
  );
}
