"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ColorArchiveList } from "@/components/color-archive-list";

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
  isPlayable: boolean;
  availabilityReason?: string;
  status: MatchStatus;
  reason: string | null;
  suggestion: SuggestedPlaylist | null;
  note: string | null;
};

export function GenreTrackList({
  playlistId,
  playlistName,
  tracks: initialTracks,
}: {
  playlistId: string;
  playlistName: string;
  tracks: GenreTrackListItem[];
}) {
  const router = useRouter();
  const [tracks, setTracks] = useState(initialTracks);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [noteOpenId, setNoteOpenId] = useState<string | null>(null);

  useEffect(() => {
    setTracks(initialTracks);
    setAddedIds({});
    setErrors({});
    setNoteOpenId(null);
    setPendingId(null);
    setPlayingTrackId(null);
  }, [initialTracks]);

  const archiveItems = useMemo(
    () =>
      tracks.map((track) => ({
        id: track.id,
        title: track.name,
        subtitle: track.artistNames,
        badge: statusLabel(track.status),
        imageUrl: track.imageUrl,
        colorKey: track.artistNames || track.name,
      })),
    [tracks],
  );

  async function playTrack(track: GenreTrackListItem) {
    if (!track.isPlayable) {
      return;
    }

    setPendingId(track.id);
    setErrors((current) => {
      const next = { ...current };
      delete next[track.id];
      return next;
    });

    try {
      const response = await fetch("/api/playback", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackUri: track.uri }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to start playback.");
      }

      setPlayingTrackId(track.id);
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [track.id]:
          error instanceof Error
            ? error.message
            : "Unable to start playback.",
      }));
    } finally {
      setPendingId(null);
    }
  }

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
          trackId: track.id,
          trackName: track.name,
          artistNames: track.artistNames,
          albumImageUrl: track.imageUrl,
          isPlayable: track.isPlayable,
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

      setAddedIds((current) => ({ ...current, [track.id]: true }));
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

  async function removeFromCurrentPlaylist(track: GenreTrackListItem) {
    const confirmed = window.confirm(
      `Remove “${track.name}” from ${playlistName}?\n\nIt will stay in ${track.suggestion?.playlistName ?? "the other playlist"} and appear under Recently Deleted for this playlist.`,
    );

    if (!confirmed) {
      return;
    }

    setPendingId(track.id);
    setErrors((current) => {
      const next = { ...current };
      delete next[track.id];
      return next;
    });

    try {
      const response = await fetch(
        `/api/playlists/${encodeURIComponent(playlistId)}/items`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            artistNames: track.artistNames,
            playlistName,
            trackId: track.id,
            trackName: track.name,
            trackUri: track.uri,
            albumImageUrl: track.imageUrl,
          }),
        },
      );
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to remove the track.");
      }

      setTracks((current) =>
        current.filter((currentTrack) => currentTrack.id !== track.id),
      );
    } catch (error) {
      setErrors((current) => ({
        ...current,
        [track.id]:
          error instanceof Error
            ? error.message
            : "Unable to remove the track.",
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

  if (tracks.length === 0) {
    return (
      <p className="mt-5 rounded-2xl border border-white/10 p-6 text-[#a7b0aa]">
        No tracks to show for this playlist.
      </p>
    );
  }

  return (
    <ColorArchiveList
      items={archiveItems}
      renderActivePanel={(item) => {
        const track = tracks.find((candidate) => candidate.id === item.id);
        if (!track) {
          return null;
        }

        const pending = pendingId === track.id;
        const added = Boolean(addedIds[track.id]);
        const noteOpen = noteOpenId === track.id;

        return (
          <div className="space-y-3">
            {track.reason ? (
              <p className="text-xs leading-5 text-black/60">{track.reason}</p>
            ) : null}
            {track.note ? (
              <p className="text-xs leading-5 text-black/75">
                Your note: {track.note}
              </p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              {track.isPlayable ? (
                <button
                  className="cursor-pointer rounded-full border border-black/20 bg-black/10 px-3 py-1.5 text-xs font-semibold text-black hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={pending}
                  onClick={() => void playTrack(track)}
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
                  className="rounded-full border border-red-900/30 bg-red-900/10 px-3 py-1.5 text-xs text-red-950"
                  title={
                    track.availabilityReason
                      ? `Spotify restriction: ${track.availabilityReason}`
                      : "This track is unavailable for playback."
                  }
                >
                  Unavailable
                </span>
              )}

              {track.suggestion ? (
                added ? (
                  <button
                    className="cursor-pointer rounded-full border border-red-900/30 bg-red-900/10 px-3 py-1.5 text-xs font-semibold text-red-950 hover:bg-red-900/15 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pending}
                    onClick={() => void removeFromCurrentPlaylist(track)}
                    type="button"
                  >
                    {pending ? "Removing…" : `Remove from ${playlistName}`}
                  </button>
                ) : (
                  <button
                    className="cursor-pointer rounded-full border border-black/20 bg-black/10 px-3 py-1.5 text-xs font-semibold text-black hover:bg-black/15 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={pending}
                    onClick={() => void addToSuggestedPlaylist(track)}
                    type="button"
                  >
                    {pending
                      ? "Adding…"
                      : `Add to ${track.suggestion.playlistName}`}
                  </button>
                )
              ) : null}

              <button
                className="cursor-pointer rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/70 hover:bg-black/10 hover:text-black disabled:opacity-60"
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
            </div>

            {errors[track.id] ? (
              <p aria-live="polite" className="text-xs text-red-900">
                {errors[track.id]}
              </p>
            ) : null}

            {noteOpen ? (
              <div className="rounded-2xl border border-black/10 bg-black/5 p-3">
                <p className="mb-2 text-xs text-black/65">
                  Teach the model why this song belongs in this playlist even if
                  it looks like a misfit. This note overrides AI for this track.
                </p>
                <textarea
                  className="min-h-20 w-full rounded-xl border border-black/15 bg-white/70 px-3 py-2 text-sm text-black placeholder:text-black/40"
                  onChange={(event) => {
                    const value = event.target.value;
                    setNoteDrafts((current) => ({
                      ...current,
                      [track.id]: value,
                    }));
                  }}
                  placeholder="e.g. Personal exception — I keep this soundtrack cut here because…"
                  value={noteDrafts[track.id] ?? ""}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    className="cursor-pointer rounded-full bg-black px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                    disabled={pending}
                    onClick={() => void saveNote(track)}
                    type="button"
                  >
                    {pending ? "Saving…" : "Save note"}
                  </button>
                  {track.note ? (
                    <button
                      className="cursor-pointer rounded-full border border-black/15 px-3 py-1.5 text-xs text-red-900 disabled:opacity-60"
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
          </div>
        );
      }}
    />
  );
}

function statusLabel(status: MatchStatus) {
  if (status === "match") {
    return "Belongs";
  }
  if (status === "no-match") {
    return "Possible misfit";
  }
  return "Needs AI";
}
