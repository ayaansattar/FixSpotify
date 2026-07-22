"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dropdown } from "@/components/dropdown";

type PlaylistOption = {
  id: string;
  name: string;
};

type GenreSortFiltersProps = {
  playlists: PlaylistOption[];
  selectedPlaylistId: string;
  pendingCount: number;
};

export function GenreSortFilters({
  playlists,
  selectedPlaylistId,
  pendingCount,
}: GenreSortFiltersProps) {
  const router = useRouter();
  const [analyzing, setAnalyzing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function analyze() {
    setAnalyzing(true);
    setMessage(null);

    try {
      const response = await fetch("/api/playlist-sort/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlistId: selectedPlaylistId, limit: 25 }),
      });
      const body = (await response.json().catch(() => null)) as {
        analyzed?: number;
        remaining?: number;
        error?: string;
      } | null;

      if (!response.ok) {
        throw new Error(body?.error ?? "Unable to analyze with Gemini.");
      }

      setMessage(
        `Analyzed ${body?.analyzed ?? 0} tracks` +
          (body?.remaining
            ? ` · ${body.remaining} still need AI. Run again for the next batch.`
            : "."),
      );
      router.refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Unable to analyze with Gemini.",
      );
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-4 rounded-2xl border border-white/10 bg-white/5 p-5 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="grid gap-2 text-sm font-medium">
          Playlist
          <Dropdown
            disabled={analyzing}
            onChange={(playlistId) => {
              setMessage(null);
              router.push(
                `/genre-sort?playlist=${encodeURIComponent(playlistId)}`,
              );
            }}
            options={playlists.map((playlist) => ({
              value: playlist.id,
              label: playlist.name,
            }))}
            value={selectedPlaylistId}
          />
        </div>

        <button
          className="cursor-pointer rounded-xl bg-[#1ed760] px-5 py-3 font-semibold text-[#07150c] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={analyzing || pendingCount === 0}
          onClick={() => void analyze()}
          type="button"
        >
          {analyzing
            ? "Asking Gemini…"
            : pendingCount > 0
              ? `Analyze next ${Math.min(25, pendingCount)} with Gemini`
              : "All analyzed"}
        </button>
      </div>

      {message ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-[#a7b0aa]">
          {message}
        </p>
      ) : null}
    </div>
  );
}
