import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { invalidatePlaylistTracksCache } from "@/lib/playlist-cache";
import {
  removeSpotifyPlaylistItem,
  SpotifyApiError,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: playlistId } = await context.params;
  const body = (await request.json().catch(() => null)) as {
    artistNames?: unknown;
    playlistName?: unknown;
    trackId?: unknown;
    trackName?: unknown;
    trackUri?: unknown;
    albumImageUrl?: unknown;
  } | null;
  const artistNames = body?.artistNames;
  const playlistName = body?.playlistName;
  const trackId = body?.trackId;
  const trackName = body?.trackName;
  const trackUri = body?.trackUri;
  const albumImageUrl =
    typeof body?.albumImageUrl === "string" && body.albumImageUrl.length > 0
      ? body.albumImageUrl
      : null;

  if (
    !playlistId ||
    playlistId.length > 100 ||
    typeof playlistName !== "string" ||
    playlistName.length === 0 ||
    playlistName.length > 500 ||
    typeof trackId !== "string" ||
    trackId.length === 0 ||
    trackId.length > 100 ||
    typeof trackName !== "string" ||
    trackName.length === 0 ||
    trackName.length > 500 ||
    typeof artistNames !== "string" ||
    artistNames.length > 1000 ||
    typeof trackUri !== "string" ||
    !trackUri.startsWith("spotify:track:") ||
    trackUri.length > 100 ||
    (albumImageUrl !== null &&
      (albumImageUrl.length > 500 || !/^https:\/\//.test(albumImageUrl)))
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
      { error: "Reconnect Spotify to edit playlists." },
      { status: 401 },
    );
  }

  try {
    await removeSpotifyPlaylistItem(accessToken, playlistId, trackUri);

    await invalidatePlaylistTracksCache(playlistId);

    try {
      await db.deletedTrack.create({
        data: {
          playlistId,
          playlistName,
          trackId,
          trackName,
          artistNames,
          trackUri,
          albumImageUrl,
        },
      });
    } catch (historyError) {
      console.error("Track removed but deletion history was not saved", historyError);
      return NextResponse.json({
        removed: true,
        warning: "Track removed, but it could not be added to deletion history.",
      });
    }

    return NextResponse.json({ removed: true });
  } catch (error) {
    const message =
      error instanceof SpotifyApiError && error.status === 403
        ? "Spotify did not allow this playlist to be edited."
        : error instanceof Error
          ? error.message
          : "Unable to remove the track.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
