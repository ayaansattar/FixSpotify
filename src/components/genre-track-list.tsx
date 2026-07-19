"use client";

import { useState } from "react";

type MatchStatus = "match" | "no-match" | "unknown";

type SuggestedPlaylist = {
  playlistId: string;
  playlistName: string;
};

type GenreTrackListItem = {
  id: string;
  uri: string;
  name: string;
  artistNames: string;
  genres: string[];
  status: MatchStatus;
  suggestion: SuggestedPlaylist | null;
};

type AddResult = "added" | "already-present";

export function GenreTrackList({
  tracks,
}: {
  tracks: GenreTrackListItem[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AddResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function addToSuggestedPlaylist(track: GenreTrackListItem) {
    if (!track.suggestion) {
      return;
    }

    setPendingId(track.id);
    setErrors((current) => {
      const next = { ...current };
      delete next[track.id];
      return next;
    });

    try {
      const response = await fetch("/api/genre-sort/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId: track.suggestion.playlistId,
          trackUri: track.uri,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        added?: boolean;
        alreadyPresent?: boolean;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(
          body?.error ?? "Unable to add the track to the playlist.",
        );
      }

      setResults((current) => ({
        ...current,
        [track.id]: body?.alreadyPresent ? "already-present" : "added",
      }));
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [track.id]:
          error instanceof Error
            ? error.message
            : "Unable to add the track to the playlist.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <ul className="mt-5 space-y-3">
      {tracks.map((track) => {
        const pending = pendingId === track.id;
        const result = results[track.id];

        return (
          <li
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/5 px-5 py-4"
            key={track.id}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{track.name}</p>
              <p className="truncate text-sm text-[#a7b0aa]">
                {track.artistNames}
              </p>
              {track.genres.length > 0 ? (
                <p className="mt-1 truncate text-xs text-[#69736d]">
                  {track.genres.join(", ")}
                </p>
              ) : null}
            </div>

            <div className="flex min-w-40 flex-col items-end gap-1.5">
              <StatusBadge status={track.status} />

              {track.suggestion ? (
                <>
                  <p className="text-xs text-[#a7b0aa]">
                    Fits{" "}
                    <span className="font-semibold text-white">
                      {track.suggestion.playlistName}
                    </span>
                  </p>
                  <button
                    className="rounded-full border border-[#1ed760]/30 bg-[#1ed760]/10 px-3 py-1.5 text-xs font-semibold text-[#1ed760] transition hover:bg-[#1ed760]/20 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pending || Boolean(result)}
                    onClick={() => addToSuggestedPlaylist(track)}
                    type="button"
                  >
                    {pending
                      ? "Adding…"
                      : result === "added"
                        ? "Added"
                        : result === "already-present"
                          ? "Already there"
                          : `Add to ${track.suggestion.playlistName}`}
                  </button>
                </>
              ) : null}

              {errors[track.id] ? (
                <p
                  aria-live="polite"
                  className="max-w-xs text-right text-xs text-red-300"
                >
                  {errors[track.id]}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function StatusBadge({ status }: { status: MatchStatus }) {
  if (status === "match") {
    return (
      <span className="rounded-full border border-[#1ed760]/30 bg-[#1ed760]/10 px-3 py-1 text-xs font-semibold text-[#1ed760]">
        Match
      </span>
    );
  }

  if (status === "no-match") {
    return (
      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
        No match
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-[#a7b0aa]">
      No genre data
    </span>
  );
}
