"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type RefreshButtonProps = {
  playlistId: string;
};

export function RefreshButton({ playlistId }: RefreshButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isRequesting, setIsRequesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = isRequesting || isPending;

  async function handleRefresh() {
    setError(null);
    setIsRequesting(true);

    try {
      const response = await fetch(
        `/api/playlists/${encodeURIComponent(playlistId)}/refresh`,
        { method: "POST" },
      );

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(body?.error ?? "Could not refresh from Spotify.");
      }

      startTransition(() => {
        router.refresh();
      });
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Could not refresh from Spotify.",
      );
    } finally {
      setIsRequesting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-60"
        disabled={busy}
        onClick={handleRefresh}
        type="button"
      >
        {busy ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1ed760] border-t-transparent" />
        ) : null}
        {busy ? "Refreshing…" : "Refresh from Spotify"}
      </button>
      {error ? <p className="text-xs text-red-300">{error}</p> : null}
    </div>
  );
}
