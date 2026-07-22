import { db } from "@/lib/db";
import { getSpotifyTrack } from "@/lib/spotify";

export type TrackMetaRecord = {
  trackId: string;
  isrc: string | null;
  name: string;
  artistName: string;
};

/**
 * Returns cached Spotify track metadata (including ISRC), fetching and storing
 * any IDs that aren't cached yet. Single-track lookups only — Spotify removed
 * batch track endpoints for development-mode apps.
 */
export async function ensureTrackMeta(
  accessToken: string,
  trackIds: string[],
): Promise<Map<string, TrackMetaRecord>> {
  const uniqueIds = Array.from(new Set(trackIds.filter(Boolean)));
  const byId = new Map<string, TrackMetaRecord>();

  if (uniqueIds.length === 0) {
    return byId;
  }

  const chunkSize = 500;

  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const cached = await db.trackMeta.findMany({
      where: { trackId: { in: chunk } },
    });

    for (const entry of cached) {
      byId.set(entry.trackId, {
        trackId: entry.trackId,
        isrc: entry.isrc,
        name: entry.name,
        artistName: entry.artistName,
      });
    }
  }

  const missing = uniqueIds.filter((id) => !byId.has(id));

  for (const trackId of missing) {
    try {
      const track = await getSpotifyTrack(accessToken, trackId);
      const record = {
        trackId,
        isrc: track.external_ids?.isrc ?? null,
        name: track.name ?? "",
        artistName:
          track.artists?.map((artist) => artist.name).filter(Boolean).join(", ") ??
          "",
      };

      await db.trackMeta.upsert({
        where: { trackId },
        create: record,
        update: {
          isrc: record.isrc,
          name: record.name,
          artistName: record.artistName,
        },
      });
      byId.set(trackId, record);
    } catch (error) {
      console.warn(`[track-meta] Failed to resolve ${trackId}`, error);
      const record = {
        trackId,
        isrc: null,
        name: "",
        artistName: "",
      };
      await db.trackMeta.upsert({
        where: { trackId },
        create: record,
        update: {},
      });
      byId.set(trackId, record);
    }
  }

  return byId;
}
