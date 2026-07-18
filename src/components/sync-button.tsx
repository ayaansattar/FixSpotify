"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type SyncResult = {
  fetched: number;
  inserted: number;
  skipped: number;
  totalPlays: number;
};

export function SyncButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSync() {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/sync", { method: "POST" });
      const body = (await response.json()) as SyncResult & { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Sync failed");
      }

      setResult(body);
      router.refresh();
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <button
        className="cursor-pointer rounded-full border border-white/20 bg-white/10 px-6 py-3 font-semibold text-white hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
        disabled={loading}
        onClick={() => void handleSync()}
        type="button"
      >
        {loading ? "Syncing…" : "Sync recently played"}
      </button>

      {result ? (
        <p className="text-sm text-[#a7b0aa]">
          Fetched {result.fetched}, inserted {result.inserted}, skipped{" "}
          {result.skipped}. Total plays in DB: {result.totalPlays}.
        </p>
      ) : null}

      {error ? <p className="text-sm text-red-300">{error}</p> : null}
    </div>
  );
}
