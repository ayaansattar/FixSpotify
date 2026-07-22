"use client";

import { useMemo, useState } from "react";

type Playlist = {
  id: string;
  name: string;
};

type PlaylistPreferencesProps = {
  playlists: Playlist[];
  initialSelectedIds: string[];
  initialDescriptions: Record<string, string>;
};

export function PlaylistPreferences({
  playlists,
  initialSelectedIds,
  initialDescriptions,
}: PlaylistPreferencesProps) {
  const [selectedIds, setSelectedIds] = useState(initialSelectedIds);
  const [descriptions, setDescriptions] = useState<Record<string, string>>(
    initialDescriptions,
  );
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const playlistById = useMemo(
    () => new Map(playlists.map((playlist) => [playlist.id, playlist])),
    [playlists],
  );
  const selectedSet = new Set(selectedIds);
  const available = playlists.filter(
    (playlist) =>
      !selectedSet.has(playlist.id) &&
      playlist.name.toLowerCase().includes(search.trim().toLowerCase()),
  );

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;

    if (target < 0 || target >= selectedIds.length) {
      return;
    }

    setSelectedIds((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setMessage(null);
  }

  function remove(playlistId: string) {
    setSelectedIds((current) =>
      current.filter((currentId) => currentId !== playlistId),
    );
    setMessage(null);
  }

  function add(playlistId: string) {
    setSelectedIds((current) => [...current, playlistId]);
    setMessage(null);
  }

  async function save() {
    if (selectedIds.length === 0) {
      setMessage("Select at least one playlist.");
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings/playlists", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          playlists: selectedIds.map((id) => ({
            id,
            description: descriptions[id] ?? "",
          })),
        }),
      });
      const result = (await response.json()) as {
        error?: string;
        saved?: number;
      };

      if (!response.ok) {
        throw new Error(result.error ?? "Unable to save playlist settings.");
      }

      setMessage(`Saved ${result.saved ?? selectedIds.length} playlists.`);
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Unable to save playlist settings.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Shown in the app</h2>
            <p className="mt-1 text-sm text-[#a7b0aa]">
              Order for dropdowns, plus intent descriptions for AI playlist
              sort. Artist cohesion is included in the defaults: keep an
              artist&apos;s songs together when most already live in one
              playlist.
            </p>
          </div>
          <button
            className="cursor-pointer rounded-full bg-[#1ed760] px-5 py-2.5 font-semibold text-[#07150c] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving || selectedIds.length === 0}
            onClick={() => void save()}
            type="button"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>

        {message ? (
          <p className="mb-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
            {message}
          </p>
        ) : null}

        <ol className="space-y-4">
          {selectedIds.map((playlistId, index) => {
            const playlist = playlistById.get(playlistId);

            if (!playlist) {
              return null;
            }

            return (
              <li
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                key={playlist.id}
              >
                <div className="grid grid-cols-[2rem_1fr_auto] items-center gap-3">
                  <span className="text-sm tabular-nums text-[#69736d]">
                    {index + 1}
                  </span>
                  <span className="min-w-0 truncate font-medium">
                    {playlist.name}
                  </span>
                  <div className="flex gap-1">
                    <button
                      aria-label={`Move ${playlist.name} up`}
                      className="cursor-pointer rounded-lg px-2 py-1 text-[#a7b0aa] hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={`Move ${playlist.name} down`}
                      className="cursor-pointer rounded-lg px-2 py-1 text-[#a7b0aa] hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-30"
                      disabled={index === selectedIds.length - 1}
                      onClick={() => move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <button
                      aria-label={`Remove ${playlist.name}`}
                      className="cursor-pointer rounded-lg px-2 py-1 text-red-300 hover:bg-red-300/10"
                      onClick={() => remove(playlist.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                <label className="mt-3 block text-xs font-medium uppercase tracking-wide text-[#69736d]">
                  Intent for AI
                  <textarea
                    className="mt-1.5 min-h-24 w-full rounded-xl border border-white/15 bg-[#111713] px-3 py-2 text-sm font-normal normal-case tracking-normal text-white placeholder:text-[#69736d]"
                    onChange={(event) => {
                      const value = event.target.value;
                      setDescriptions((current) => ({
                        ...current,
                        [playlist.id]: value,
                      }));
                      setMessage(null);
                    }}
                    placeholder="Describe what belongs in this playlist…"
                    value={descriptions[playlist.id] ?? ""}
                  />
                </label>
              </li>
            );
          })}
          {selectedIds.length === 0 ? (
            <li className="rounded-2xl border border-white/10 p-6 text-sm text-[#a7b0aa]">
              Add at least one playlist from the list beside this one.
            </li>
          ) : null}
        </ol>

        {selectedIds.length > 1 ? (
          <button
            className="mt-4 cursor-pointer text-sm text-red-300"
            onClick={() => {
              setSelectedIds([]);
              setMessage(null);
            }}
            type="button"
          >
            Clear selection
          </button>
        ) : null}
      </section>

      <section>
        <h2 className="text-xl font-semibold">Other owned playlists</h2>
        <p className="mt-1 text-sm text-[#a7b0aa]">
          Add a playlist to place it at the bottom of your list.
        </p>
        <input
          className="mt-4 w-full rounded-xl border border-white/15 bg-[#111713] px-4 py-3 text-white placeholder:text-[#69736d]"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search playlists"
          type="search"
          value={search}
        />

        <ul className="mt-4 max-h-[38rem] overflow-y-auto rounded-2xl border border-white/10">
          {available.map((playlist) => (
            <li
              className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 last:border-b-0"
              key={playlist.id}
            >
              <span className="min-w-0 truncate">{playlist.name}</span>
              <button
                className="cursor-pointer rounded-full border border-white/15 px-3 py-1.5 text-sm hover:bg-white/10"
                onClick={() => add(playlist.id)}
                type="button"
              >
                Add
              </button>
            </li>
          ))}
          {available.length === 0 ? (
            <li className="p-6 text-sm text-[#a7b0aa]">
              No matching unselected playlists.
            </li>
          ) : null}
        </ul>
      </section>
    </div>
  );
}
