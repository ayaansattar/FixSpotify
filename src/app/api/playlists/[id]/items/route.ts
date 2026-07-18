import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
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
    trackUri?: unknown;
  } | null;
  const trackUri = body?.trackUri;

  if (
    !playlistId ||
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
      { error: "Reconnect Spotify to edit playlists." },
      { status: 401 },
    );
  }

  try {
    const result = await removeSpotifyPlaylistItem(
      accessToken,
      playlistId,
      trackUri,
    );
    return NextResponse.json({ removed: true, snapshotId: result.snapshot_id });
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
