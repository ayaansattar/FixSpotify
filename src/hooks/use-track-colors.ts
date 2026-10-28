"use client";

import { useEffect, useMemo, useState } from "react";

import {
  colorFromKey,
  extractAlbumColor,
  getCachedAlbumColor,
} from "@/lib/track-color";

export type TrackColorSource = {
  id: string;
  colorKey: string;
  imageUrl?: string | null;
};

/** Covers decoded in parallel. */
const CONCURRENCY = 4;
/** Batch resolved colors into one state update per window (one list render). */
const FLUSH_MS = 200;

/**
 * Resolves a background color per track: artist/title hash immediately, then
 * upgrades to album-cover color when extraction succeeds. Colors are keyed by
 * image URL, so filtering or searching the list never resets them.
 */
export function useTrackColors(tracks: TrackColorSource[]) {
  // Bumped on each batched flush; the actual colors live in the module cache.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let flushTimer: number | null = null;
    const pending = new Set<string>();

    for (const track of tracks) {
      if (track.imageUrl && getCachedAlbumColor(track.imageUrl) === undefined) {
        pending.add(track.imageUrl);
      }
    }

    if (pending.size === 0) {
      return;
    }

    const queue = Array.from(pending);

    function scheduleFlush() {
      if (flushTimer !== null || cancelled) {
        return;
      }
      flushTimer = window.setTimeout(() => {
        flushTimer = null;
        if (!cancelled) {
          setVersion((current) => current + 1);
        }
      }, FLUSH_MS);
    }

    async function worker() {
      while (!cancelled && queue.length > 0) {
        const imageUrl = queue.shift()!;
        const color = await extractAlbumColor(imageUrl);
        if (color) {
          scheduleFlush();
        }
      }
    }

    for (let i = 0; i < CONCURRENCY; i += 1) {
      void worker();
    }

    return () => {
      cancelled = true;
      if (flushTimer !== null) {
        window.clearTimeout(flushTimer);
      }
    };
  }, [tracks]);

  return useMemo(() => {
    void version;
    const map = new Map<string, string>();
    for (const track of tracks) {
      const albumColor = track.imageUrl
        ? getCachedAlbumColor(track.imageUrl)
        : null;
      map.set(track.id, albumColor ?? colorFromKey(track.colorKey || track.id));
    }
    return map;
  }, [tracks, version]);
}
