import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  getCachedPlaylistTracks,
  invalidatePlaylistTracksCache,
} from "@/lib/playlist-cache";
import {
  addSpotifyPlaylistItem,
  describeSpotifyError,
  SpotifyApiError,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    playlistId?: unknown;
    trackUri?: unknown;
  } | null;
  const playlistId = body?.playlistId;
  const trackUri = body?.trackUri;

  if (
    typeof playlistId !== "string" ||
    playlistId.length === 0 ||
    playlistId.length > 100 ||
    typeof trackUri !== "string" ||
    !trackUri.startsWith("spotify:track:") ||
    trackUri.length > 100
  ) {
    return NextResponse.json(
      { error: "Invalid playlist or track." },
      { status: 400 },
    );
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect Spotify to add tracks." },
      { status: 401 },
    );
  }

  try {
    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      playlistId,
    );
    const alreadyPresent = playlistTracks.some(
      (track) => track.uri === trackUri,
    );

    if (!alreadyPresent) {
      await addSpotifyPlaylistItem(accessToken, playlistId, trackUri);
      await invalidatePlaylistTracksCache(playlistId);
    }

    return NextResponse.json({
      added: !alreadyPresent,
      alreadyPresent,
    });
  } catch (error) {
    const message =
      error instanceof SpotifyApiError && error.status === 403
        ? "Spotify did not allow this playlist to be edited."
        : error instanceof SpotifyApiError && error.status === 404
          ? "That playlist no longer exists on Spotify."
          : describeSpotifyError(
              error,
              "Unable to add the track to the suggested playlist.",
            );

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
