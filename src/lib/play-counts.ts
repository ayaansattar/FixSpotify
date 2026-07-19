import { db } from "@/lib/db";

export type CountableTrack = {
  id: string;
  name: string;
  artistIds: string[];
};

export async function getPlayCounts(
  tracks: CountableTrack[],
  since: Date | null,
) {
  const countByTrack = new Map<string, number>();
  // SQLite limits query parameters, so large playlists are counted in chunks.
  const chunkSize = 500;
  const trackIds = tracks.map((track) => track.id);

  for (let i = 0; i < trackIds.length; i += chunkSize) {
    const chunk = trackIds.slice(i, i + chunkSize);
    const playCounts = await db.play.groupBy({
      by: ["trackId"],
      where: {
        trackId: { in: chunk },
        ...(since ? { playedAt: { gte: since } } : {}),
      },
      _count: { _all: true },
    });

    for (const play of playCounts) {
      countByTrack.set(play.trackId, play._count._all);
    }
  }

  const unmatched = tracks.filter((track) => !countByTrack.has(track.id));

  if (unmatched.length === 0) {
    return countByTrack;
  }

  // Spotify can assign different ids to the same song on different releases.
  // For tracks with no direct id match, use a normalized name match and reject
  // known artists that differ. Imported history has artistId "unknown".
  const playlistIds = new Set(trackIds);
  const countsByName = new Map<
    string,
    Array<{ artistId: string; count: number }>
  >();
  const nameTrackGroups = await db.play.groupBy({
    by: ["trackName", "trackId", "artistId"],
    where: since ? { playedAt: { gte: since } } : {},
    _count: { _all: true },
  });

  for (const group of nameTrackGroups) {
    if (playlistIds.has(group.trackId)) {
      continue;
    }

    const key = normalizeTrackName(group.trackName);
    const entries = countsByName.get(key) ?? [];
    entries.push({ artistId: group.artistId, count: group._count._all });
    countsByName.set(key, entries);
  }

  for (const track of unmatched) {
    const candidates = countsByName.get(normalizeTrackName(track.name)) ?? [];
    const total = candidates
      .filter(
        (candidate) =>
          candidate.artistId === "unknown" ||
          track.artistIds.includes(candidate.artistId),
      )
      .reduce((sum, candidate) => sum + candidate.count, 0);

    if (total > 0) {
      countByTrack.set(track.id, total);
    }
  }

  return countByTrack;
}

function normalizeTrackName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
