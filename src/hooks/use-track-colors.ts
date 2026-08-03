"use client";

import { useEffect, useMemo, useState } from "react";

import { colorFromKey, extractAlbumColor } from "@/lib/track-color";

export type TrackColorSource = {
  id: string;
  colorKey: string;
  imageUrl?: string | null;
};

/**
 * Resolves a background color per track: artist/title hash immediately, then
 * upgrades to album-cover color when extraction succeeds.
 */
export function useTrackColors(tracks: TrackColorSource[]) {
  const fallbacks = useMemo(() => {
    const map = new Map<string, string>();
    for (const track of tracks) {
      map.set(track.id, colorFromKey(track.colorKey || track.id));
    }
    return map;
  }, [tracks]);

  const [resolved, setResolved] = useState<Map<string, string>>(
    () => new Map(fallbacks),
  );

  useEffect(() => {
    setResolved(new Map(fallbacks));

    let cancelled = false;
    const uniqueImages = new Map<string, string[]>();

    for (const track of tracks) {
      if (!track.imageUrl) {
        continue;
      }
      const ids = uniqueImages.get(track.imageUrl) ?? [];
      ids.push(track.id);
      uniqueImages.set(track.imageUrl, ids);
    }

    void (async () => {
      for (const [imageUrl, trackIds] of uniqueImages) {
        if (cancelled) {
          return;
        }
        const color = await extractAlbumColor(imageUrl);
        if (!color || cancelled) {
          continue;
        }
        setResolved((current) => {
          const next = new Map(current);
          for (const id of trackIds) {
            next.set(id, color);
          }
          return next;
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [fallbacks, tracks]);

  return resolved;
}
