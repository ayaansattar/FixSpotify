"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AlbumCover } from "@/components/album-cover";

type MatchStatus = "match" | "no-match" | "pending";

type SuggestedPlaylist = {
  playlistId: string;
  playlistName: string;
};

type GenreTrackListItem = {
  id: string;
  uri: string;
  name: string;
  artistNames: string;
  imageUrl: string | null;
  status: MatchStatus;
  reason: string | null;
  suggestion: SuggestedPlaylist | null;
  note: string | null;
};

type AddResult = "added" | "already-present";

export function GenreTrackList({
  playlistId,
  tracks,
}: {
  playlistId: string;
  tracks: GenreTrackListItem[];
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, AddResult>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);

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

  async function saveNote(track: GenreTrackListItem) {
    const note = (noteDrafts[track.id] ?? track.note ?? "").trim();
    if (!note) {
      setErrors((current) => ({
        ...current,
        [track.id]: "Write a short reason first.",
      }));
      return;
    }

    setPendingId(track.id);
    setErrors((current) => {
      const next = { ...current };
      delete next[track.id];
      return next;
    });

    try {
      const response = await fetch("/api/playlist-sort/note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistId,
          trackId: track.id,
          trackName: track.name,
          artistNames: track.artistNames,
          note,
        }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to save note.");
      }

      setNoteOpenId(null);
      router.refresh();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [track.id]:
          error instanceof Error ? error.message : "Unable to save note.",
      }));
    } finally {
      setPendingId(null);
    }
  }

  async function clearNote(track: GenreTrackListItem) {
    setPendingId(track.id);
    try {
      const response = await fetch("/api/playlist-sort/note", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId, trackId: track.id }),
      });
      if (!response.ok) {
        throw new Error("Unable to clear note.");
      }
      router.refresh();
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [track.id]:
          error instanceof Error ? error.message : "Unable to clear note.",
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
        const noteOpen = noteOpenId === track.id;

        return (
          <li
            className="rounded-2xl border border-white/5 bg-white/5 px-5 py-4"
            key={track.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <AlbumCover url={track.imageUrl} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{track.name}</p>
                  <p className="truncate text-sm text-[#a7b0aa]">
                    {track.artistNames}
                  </p>
                  {track.reason ? (
                    <p className="mt-1 text-xs leading-5 text-[#69736d]">
                      {track.reason}
                    </p>
                  ) : null}
                  {track.note ? (
                    <p className="mt-1 text-xs leading-5 text-[#8cf0ae]">
                      Your note: {track.note}
                    </p>
                  ) : null}
                </div>
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
                      onClick={() => void addToSuggestedPlaylist(track)}
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

                <button
                  className="cursor-pointer text-xs text-[#a7b0aa] hover:text-white disabled:opacity-60"
                  disabled={pending}
                  onClick={() => {
                    setNoteOpenId(noteOpen ? null : track.id);
                    setNoteDrafts((current) => ({
                      ...current,
                      [track.id]: current[track.id] ?? track.note ?? "",
                    }));
                  }}
                  type="button"
                >
                  {track.note ? "Edit keep reason" : "Keep here because…"}
                </button>

                {errors[track.id] ? (
                  <p
                    aria-live="polite"
                    className="max-w-xs text-right text-xs text-red-300"
                  >
                    {errors[track.id]}
                  </p>
                ) : null}
              </div>
            </div>

            {noteOpen ? (
              <div className="mt-3 border-t border-white/10 pt-3">
                <p className="mb-2 text-xs text-[#a7b0aa]">
                  Teach the model why this song belongs in this playlist even
                  if it looks like a misfit. This note overrides AI for this
                  track.
                </p>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-white/15 bg-[#111713] px-3 py-2 text-sm text-white placeholder:text-[#69736d]"
                  onChange={(event) => {
                    const value = event.target.value;
                    setNoteDrafts((current) => ({
                      ...current,
                      [track.id]: value,
                    }));
                  }}
                  placeholder="e.g. Personal exception — I keep this soundtrack cut with my Indian playlist because…"
                  value={noteDrafts[track.id] ?? ""}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="cursor-pointer rounded-full bg-[#1ed760] px-3 py-1.5 text-xs font-semibold text-[#07150c] disabled:opacity-60"
                    disabled={pending}
                    onClick={() => void saveNote(track)}
                    type="button"
                  >
                    {pending ? "Saving…" : "Save note"}
                  </button>
                  {track.note ? (
                    <button
                      className="cursor-pointer rounded-full border border-white/15 px-3 py-1.5 text-xs text-red-300 disabled:opacity-60"
                      disabled={pending}
                      onClick={() => void clearNote(track)}
                      type="button"
                    >
                      Clear note
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}
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
        Belongs
      </span>
    );
  }

  if (status === "no-match") {
    return (
      <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-200">
        Possible misfit
      </span>
    );
  }

  return (
    <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-[#a7b0aa]">
      Needs AI
    </span>
  );
}
