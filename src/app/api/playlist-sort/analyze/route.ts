import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import {
  analyzeTracksWithGemini,
  getPreferredSortPlaylists,
} from "@/lib/playlist-sort";
import { getPreferredPlaylists } from "@/lib/playlists";
import { getValidAccessToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect Spotify to analyze playlists." },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    playlistId?: unknown;
    limit?: unknown;
  } | null;
  const playlistId = body?.playlistId;
  const limit =
    typeof body?.limit === "number" && body.limit > 0 && body.limit <= 40
      ? Math.floor(body.limit)
      : 25;

  if (
    typeof playlistId !== "string" ||
    playlistId.length === 0 ||
    playlistId.length > 100
  ) {
    return NextResponse.json({ error: "Invalid playlist." }, { status: 400 });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is missing. Add a free key from Google AI Studio to your .env.",
      },
      { status: 400 },
    );
  }

  try {
    const playlists = await getPreferredPlaylists(accessToken);
    const source = playlists.find((playlist) => playlist.id === playlistId);

    if (!source) {
      return NextResponse.json(
        { error: "Playlist is not in your preferred list." },
        { status: 400 },
      );
    }

    const sortPlaylists = await getPreferredSortPlaylists(playlists);
    const sourceTarget = sortPlaylists.find(
      (playlist) => playlist.id === playlistId,
    );

    if (!sourceTarget) {
      return NextResponse.json(
        { error: "Playlist description is missing." },
        { status: 400 },
      );
    }

    const tracks = await getCachedPlaylistTracks(accessToken, playlistId);
    const uniqueTracks = Array.from(
      new Map(tracks.map((track) => [track.id, track])).values(),
    );

    const result = await analyzeTracksWithGemini({
      accessToken,
      sourcePlaylist: sourceTarget,
      playlists: sortPlaylists,
      tracks: uniqueTracks,
      limit,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to analyze playlist with Gemini.",
      },
      { status: 502 },
    );
  }
}
