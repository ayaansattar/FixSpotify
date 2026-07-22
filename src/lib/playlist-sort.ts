import { db } from "@/lib/db";
import {
  hashSortInput,
  sortTracksWithGemini,
  type PlaylistSortTarget,
  type SortTrackResult,
} from "@/lib/gemini";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import type { SpotifyPlaylistTrack } from "@/lib/spotify";

/** Drafted from the user's preferred playlist contents + artist cohesion rule. */
export const DEFAULT_PLAYLIST_DESCRIPTIONS: Record<string, string> = {
  "4J8kCkCQa9k8St81bGb6FD":
    "TikTok / phonk / aggressive electronic: Brazilian funk montagens, slowed+reverb, dark bass, viral club edits and hyper-energetic internet bangers. Not mainstream radio pop.",
  "2Acybg2NE2aNHJPtp48QK5":
    "Movie soundtracks and cinematic scores — film themes, trailer music, orchestral/hybrid score composers (Hans Zimmer, Göransson, etc.). Score-first; not pop songs that merely appeared in a film.",
  "1cS7u3ogVFD6Q64gA5K8TG":
    "Traditional qawwali, Sufi, and ghazal — Nusrat Fateh Ali Khan, Abida Parveen, Sabri Brothers, Mehdi Hassan, and similar. Classical/devotional South Asian vocal traditions, not modern pop covers.",
  "6nXH32eNQYnYEzj0zWKZxr":
    "Misc classics and timeless international hits that do not fit a tighter playlist — oldies, ABBA-era pop, classic rock-adjacent standards, reggae classics, etc. Catch-all for older/cross-genre favorites.",
  "5t4DXNHLw0tYv3f5vWkOpq":
    "Indian / Bollywood and Hindi film & indie music — Pritam, Arijit Singh, A.R. Rahman, Shreya Ghoshal, etc. Indian-language songs. Not Pakistani rock bands or contemporary Urdu indie (those have their own playlists).",
  "5cBUYTXCACPhXcodh9YIIW":
    "Pakistani rock and alternative bands — Strings, Junoon, Bayaan, Vital Signs, Call, Noori, Mizraab, and similar band-oriented Pakistani rock.",
  "1eIykIQW7ANI8p4hUh6xKQ":
    "Contemporary Pakistani / Urdu pop and indie (Coke Studio–era modern tracks) — Hasan Raheem, Asim Azhar, Ali Zafar, Annural Khalid, Kaavish, etc. Modern Urdu vocals that are not traditional qawwali and not classic Pakistani rock bands.",
  "4wDFiAl5S3dG7YRV8tl4NE":
    "Hip-hop and rap — US mainstream (Drake, Kendrick, Travis Scott, Eminem) plus Desi hip-hop (Faaris, Talha Anjum, etc.). Rap-forward tracks; not pop songs with only a guest verse.",
  "6QLlGtJh6WhyERUV63piWr":
    "Modern pop / R&B and dance-pop — Taylor Swift, The Weeknd, Ed Sheeran, Dua Lipa, David Guetta, and similar contemporary chart/radio pop.",
  "5195EiuFqiKIHgE0Ze5bPF":
    "Rock and metal — classic rock, alternative, nu-metal, metal (Slipknot, Metallica, Queen, Linkin Park, TOOL, etc.). Guitar-driven rock/metal identities.",
};

const GLOBAL_ARTIST_RULE =
  "Artist cohesion: if the majority of an artist's songs already live in one preferred playlist, keep the rest of that artist's songs in that playlist unless a user note says otherwise.";

export async function ensurePlaylistDescriptions() {
  const prefs = await db.playlistPreference.findMany();

  for (const pref of prefs) {
    if (pref.description.trim()) {
      continue;
    }

    const draft = DEFAULT_PLAYLIST_DESCRIPTIONS[pref.playlistId];
    if (!draft) {
      continue;
    }

    await db.playlistPreference.update({
      where: { playlistId: pref.playlistId },
      data: { description: `${draft}\n\n${GLOBAL_ARTIST_RULE}` },
    });
  }
}

export async function getPreferredSortPlaylists(
  playlists: Array<{ id: string; name: string }>,
): Promise<PlaylistSortTarget[]> {
  await ensurePlaylistDescriptions();

  const prefs = await db.playlistPreference.findMany({
    orderBy: { position: "asc" },
  });
  const byId = new Map(prefs.map((pref) => [pref.playlistId, pref]));

  return playlists.map((playlist) => ({
    id: playlist.id,
    name: playlist.name,
    description: byId.get(playlist.id)?.description ?? "",
  }));
}

export function buildInputHash(playlists: PlaylistSortTarget[]) {
  // Notes override at read time and must not bust the whole playlist cache.
  return hashSortInput(
    playlists.map(
      (playlist) => `${playlist.id}|${playlist.name}|${playlist.description}`,
    ),
  );
}

export async function computeArtistHomes(
  accessToken: string,
  playlists: Array<{ id: string; name: string }>,
) {
  const counts = new Map<string, Map<string, number>>();

  for (const playlist of playlists) {
    const tracks = await getCachedPlaylistTracks(accessToken, playlist.id);
    const unique = Array.from(
      new Map(tracks.map((track) => [track.id, track])).values(),
    );

    for (const track of unique) {
      for (const artist of track.artists) {
        const name = artist.name?.trim();
        if (!name) {
          continue;
        }

        const byPlaylist = counts.get(name) ?? new Map<string, number>();
        byPlaylist.set(playlist.id, (byPlaylist.get(playlist.id) ?? 0) + 1);
        counts.set(name, byPlaylist);
      }
    }
  }

  const nameById = new Map(playlists.map((playlist) => [playlist.id, playlist.name]));
  const homes: Array<{
    artist: string;
    playlistId: string;
    playlistName: string;
    share: string;
    total: number;
  }> = [];

  for (const [artist, byPlaylist] of counts) {
    let total = 0;
    let bestId = "";
    let bestCount = 0;

    for (const [playlistId, count] of byPlaylist) {
      total += count;
      if (count > bestCount) {
        bestCount = count;
        bestId = playlistId;
      }
    }

    if (total < 2 || bestCount / total < 0.5 || !bestId) {
      continue;
    }

    homes.push({
      artist,
      playlistId: bestId,
      playlistName: nameById.get(bestId) ?? bestId,
      share: `${Math.round((bestCount / total) * 100)}%`,
      total,
    });
  }

  homes.sort((a, b) => b.total - a.total);
  return homes;
}

export type AnalyzedSortTrack = {
  id: string;
  uri: string;
  name: string;
  artistNames: string;
  imageUrl: string | null;
  status: "match" | "no-match" | "pending";
  reason: string | null;
  suggestion: { playlistId: string; playlistName: string } | null;
  note: string | null;
};

export async function loadAnalyzedTracks(options: {
  accessToken: string;
  sourcePlaylistId: string;
  playlists: PlaylistSortTarget[];
  tracks: SpotifyPlaylistTrack[];
}): Promise<{ tracks: AnalyzedSortTrack[]; pendingCount: number; inputHash: string }> {
  const notes = await db.playlistTrackNote.findMany({
    where: { playlistId: options.sourcePlaylistId },
  });
  const noteByTrack = new Map(notes.map((note) => [note.trackId, note]));
  const inputHash = buildInputHash(options.playlists);

  const cached = await db.aiSortCache.findMany({
    where: {
      sourcePlaylistId: options.sourcePlaylistId,
      inputHash,
      trackId: { in: options.tracks.map((track) => track.id) },
    },
  });
  const cacheByTrack = new Map(cached.map((row) => [row.trackId, row]));
  const playlistNameById = new Map(
    options.playlists.map((playlist) => [playlist.id, playlist.name]),
  );

  const artistHomes = await computeArtistHomes(
    options.accessToken,
    options.playlists,
  );
  const homeByArtist = new Map(
    artistHomes.map((home) => [home.artist.toLowerCase(), home]),
  );

  let pendingCount = 0;
  const analyzed: AnalyzedSortTrack[] = options.tracks.map((track) => {
    const note = noteByTrack.get(track.id);
    if (note?.note.trim()) {
      return {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artistNames: track.artists.map((artist) => artist.name).join(", "),
        imageUrl: track.imageUrl,
        status: "match" as const,
        reason: `Kept by your note: ${note.note}`,
        suggestion: null,
        note: note.note,
      };
    }

    // Soft artist-cohesion override before/without AI.
    const artistNames = track.artists.map((artist) => artist.name);
    for (const name of artistNames) {
      const home = homeByArtist.get(name.toLowerCase());
      if (!home) {
        continue;
      }

      if (home.playlistId === options.sourcePlaylistId) {
        return {
          id: track.id,
          uri: track.uri,
          name: track.name,
          artistNames: artistNames.join(", "),
          imageUrl: track.imageUrl,
          status: "match" as const,
          reason: `Artist cohesion: most of ${name}'s tracks are already in this playlist (${home.share}).`,
          suggestion: null,
          note: null,
        };
      }

      // Majority elsewhere → suggest that playlist even before AI.
      return {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artistNames: artistNames.join(", "),
        imageUrl: track.imageUrl,
        status: "no-match" as const,
        reason: `Artist cohesion: most of ${name}'s tracks live in ${home.playlistName} (${home.share}).`,
        suggestion: {
          playlistId: home.playlistId,
          playlistName: home.playlistName,
        },
        note: null,
      };
    }

    const cachedRow = cacheByTrack.get(track.id);
    if (!cachedRow) {
      pendingCount += 1;
      return {
        id: track.id,
        uri: track.uri,
        name: track.name,
        artistNames: track.artists.map((artist) => artist.name).join(", "),
        imageUrl: track.imageUrl,
        status: "pending" as const,
        reason: null,
        suggestion: null,
        note: null,
      };
    }

    const belongs = cachedRow.belongs || !cachedRow.suggestedPlaylistId;
    return {
      id: track.id,
      uri: track.uri,
      name: track.name,
      artistNames: track.artists.map((artist) => artist.name).join(", "),
      imageUrl: track.imageUrl,
      status: belongs ? ("match" as const) : ("no-match" as const),
      reason: cachedRow.reason,
      suggestion:
        !belongs && cachedRow.suggestedPlaylistId
          ? {
              playlistId: cachedRow.suggestedPlaylistId,
              playlistName:
                playlistNameById.get(cachedRow.suggestedPlaylistId) ??
                cachedRow.suggestedPlaylistId,
            }
          : null,
      note: null,
    };
  });

  analyzed.sort(
    (a, b) =>
      statusRank[a.status] - statusRank[b.status] ||
      a.name.localeCompare(b.name),
  );

  return { tracks: analyzed, pendingCount, inputHash };
}

const statusRank: Record<AnalyzedSortTrack["status"], number> = {
  "no-match": 0,
  pending: 1,
  match: 2,
};

export async function analyzeTracksWithGemini(options: {
  accessToken: string;
  sourcePlaylist: PlaylistSortTarget;
  playlists: PlaylistSortTarget[];
  tracks: SpotifyPlaylistTrack[];
  limit?: number;
}) {
  const limit = options.limit ?? 40;
  const { tracks: analyzed, inputHash } = await loadAnalyzedTracks({
    accessToken: options.accessToken,
    sourcePlaylistId: options.sourcePlaylist.id,
    playlists: options.playlists,
    tracks: options.tracks,
  });

  const pendingIds = new Set(
    analyzed
      .filter((track) => track.status === "pending")
      .slice(0, limit)
      .map((track) => track.id),
  );
  const batch = options.tracks.filter((track) => pendingIds.has(track.id));

  if (batch.length === 0) {
    return { analyzed: 0, remaining: 0 };
  }

  const notes = await db.playlistTrackNote.findMany({
    where: {
      playlistId: options.sourcePlaylist.id,
      trackId: { in: batch.map((track) => track.id) },
    },
  });

  const artistHomes = await computeArtistHomes(
    options.accessToken,
    options.playlists,
  );

  const results = await sortTracksWithGemini({
    sourcePlaylist: options.sourcePlaylist,
    playlists: options.playlists,
    tracks: batch.map((track) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist) => artist.name).join(", "),
    })),
    artistHomes: artistHomes.slice(0, 80).map((home) => ({
      artist: home.artist,
      playlistName: home.playlistName,
      share: home.share,
    })),
    placementNotes: notes.map((note) => ({
      trackId: note.trackId,
      trackName: note.trackName,
      note: note.note,
    })),
  });

  await saveSortResults(
    options.sourcePlaylist.id,
    inputHash,
    applyArtistCohesion(results, batch, artistHomes, options.sourcePlaylist.id),
  );

  const remaining = Math.max(0, analyzed.filter((t) => t.status === "pending").length - batch.length);
  return { analyzed: batch.length, remaining };
}

function applyArtistCohesion(
  results: SortTrackResult[],
  tracks: SpotifyPlaylistTrack[],
  artistHomes: Array<{
    artist: string;
    playlistId: string;
    playlistName: string;
    share: string;
  }>,
  sourcePlaylistId: string,
): SortTrackResult[] {
  const homeByArtist = new Map(
    artistHomes.map((home) => [home.artist.toLowerCase(), home]),
  );
  const trackById = new Map(tracks.map((track) => [track.id, track]));

  return results.map((result) => {
    const track = trackById.get(result.trackId);
    if (!track) {
      return result;
    }

    for (const artist of track.artists) {
      const home = homeByArtist.get(artist.name.toLowerCase());
      if (!home) {
        continue;
      }

      if (home.playlistId === sourcePlaylistId) {
        return {
          ...result,
          belongs: true,
          suggestedPlaylistId: null,
          reason: `Artist cohesion: most of ${artist.name}'s tracks are already in this playlist (${home.share}).`,
        };
      }

      return {
        ...result,
        belongs: false,
        suggestedPlaylistId: home.playlistId,
        reason: `Artist cohesion: most of ${artist.name}'s tracks live in ${home.playlistName} (${home.share}).`,
      };
    }

    return result;
  });
}

async function saveSortResults(
  sourcePlaylistId: string,
  inputHash: string,
  results: SortTrackResult[],
) {
  for (const result of results) {
    await db.aiSortCache.upsert({
      where: {
        trackId_sourcePlaylistId_inputHash: {
          trackId: result.trackId,
          sourcePlaylistId,
          inputHash,
        },
      },
      create: {
        trackId: result.trackId,
        sourcePlaylistId,
        inputHash,
        belongs: result.belongs,
        suggestedPlaylistId: result.suggestedPlaylistId,
        reason: result.reason,
      },
      update: {
        belongs: result.belongs,
        suggestedPlaylistId: result.suggestedPlaylistId,
        reason: result.reason,
      },
    });
  }
}
