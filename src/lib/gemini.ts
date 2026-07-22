import { createHash } from "node:crypto";

import { GoogleGenerativeAI } from "@google/generative-ai";

const DEFAULT_MODEL = "gemini-2.0-flash";

export function getGeminiModel() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to your .env from Google AI Studio.",
    );
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: "application/json",
    },
  });
}

export function hashSortInput(parts: string[]) {
  return createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 32);
}

export type PlaylistSortTarget = {
  id: string;
  name: string;
  description: string;
};

export type SortTrackInput = {
  id: string;
  name: string;
  artists: string;
};

export type SortTrackResult = {
  trackId: string;
  belongs: boolean;
  suggestedPlaylistId: string | null;
  reason: string;
};

/**
 * Asks Gemini whether each track belongs in the source playlist, and if not
 * which preferred playlist fits better — using playlist intent descriptions,
 * artist-majority hints, and user-authored placement notes.
 */
export async function sortTracksWithGemini(options: {
  sourcePlaylist: PlaylistSortTarget;
  playlists: PlaylistSortTarget[];
  tracks: SortTrackInput[];
  artistHomes: Array<{ artist: string; playlistName: string; share: string }>;
  placementNotes: Array<{
    trackId: string;
    trackName: string;
    note: string;
  }>;
}): Promise<SortTrackResult[]> {
  const model = getGeminiModel();
  const playlistIds = new Set(options.playlists.map((playlist) => playlist.id));

  const prompt = `You help organize a personal Spotify library.

GLOBAL RULE — artist cohesion:
If most of an artist's songs already live in one playlist, keep the rest of that artist's songs there unless a user note says otherwise.

SOURCE PLAYLIST (tracks currently live here):
- id: ${options.sourcePlaylist.id}
- name: ${options.sourcePlaylist.name}
- intent: ${options.sourcePlaylist.description || "(no description yet)"}

ALL PREFERRED PLAYLISTS (choose suggestedPlaylistId only from these ids):
${options.playlists
  .map(
    (playlist) =>
      `- id: ${playlist.id}\n  name: ${playlist.name}\n  intent: ${playlist.description || "(no description yet)"}`,
  )
  .join("\n")}

ARTIST MAJORITY HOMES (computed from the library — respect these strongly):
${
  options.artistHomes.length > 0
    ? options.artistHomes
        .map(
          (home) =>
            `- ${home.artist}: usually in "${home.playlistName}" (${home.share} of their preferred-playlist tracks)`,
        )
        .join("\n")
    : "(none with a clear majority)"
}

USER PLACEMENT NOTES (these override your instincts — if a note exists for a track in the source playlist, that track BELONGS there):
${
  options.placementNotes.length > 0
    ? options.placementNotes
        .map(
          (note) =>
            `- trackId ${note.trackId} ("${note.trackName}"): ${note.note}`,
        )
        .join("\n")
    : "(none)"
}

TRACKS TO JUDGE:
${options.tracks
  .map(
    (track) =>
      `- trackId: ${track.id}\n  title: ${track.name}\n  artists: ${track.artists}`,
  )
  .join("\n")}

Return a JSON array only (no markdown). One object per track, same order:
[
  {
    "trackId": "string",
    "belongs": true|false,
    "suggestedPlaylistId": "playlist id or null if belongs is true",
    "reason": "one short sentence"
  }
]

Rules:
- belongs=true means the track should stay in the source playlist.
- If belongs=false, suggestedPlaylistId must be one of the preferred playlist ids above (not the source, unless no better fit exists — then prefer belongs=true).
- Prefer artist majority homes when relevant.
- Honor user placement notes absolutely for those tracks.`;

  const response = await model.generateContent(prompt);
  const text = response.response.text();
  const parsed = JSON.parse(extractJson(text)) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error("Gemini returned a non-array response.");
  }

  const byId = new Map(
    options.tracks.map((track) => [track.id, track] as const),
  );
  const results: SortTrackResult[] = [];

  for (const row of parsed) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const record = row as Record<string, unknown>;
    const trackId = typeof record.trackId === "string" ? record.trackId : "";
    if (!trackId || !byId.has(trackId)) {
      continue;
    }

    const belongs = record.belongs === true;
    let suggestedPlaylistId =
      typeof record.suggestedPlaylistId === "string"
        ? record.suggestedPlaylistId
        : null;

    if (
      suggestedPlaylistId &&
      (!playlistIds.has(suggestedPlaylistId) ||
        suggestedPlaylistId === options.sourcePlaylist.id)
    ) {
      suggestedPlaylistId = null;
    }

    results.push({
      trackId,
      belongs: belongs || !suggestedPlaylistId,
      suggestedPlaylistId: belongs ? null : suggestedPlaylistId,
      reason:
        typeof record.reason === "string" && record.reason.trim()
          ? record.reason.trim()
          : belongs
            ? "Fits this playlist."
            : "Possible better fit elsewhere.",
    });
  }

  // Ensure every requested track has a result.
  for (const track of options.tracks) {
    if (results.some((result) => result.trackId === track.id)) {
      continue;
    }

    results.push({
      trackId: track.id,
      belongs: true,
      suggestedPlaylistId: null,
      reason: "No model result; left in place.",
    });
  }

  return results;
}

function extractJson(text: string) {
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  throw new Error("Could not parse JSON from Gemini response.");
}
