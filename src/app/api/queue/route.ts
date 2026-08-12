import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { addSpotifyQueueTrack, SpotifyApiError } from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    trackUri?: unknown;
  } | null;
  const trackUri = body?.trackUri;

  if (
    typeof trackUri !== "string" ||
    !trackUri.startsWith("spotify:track:") ||
    trackUri.length > 100
  ) {
    return NextResponse.json({ error: "Invalid track URI." }, { status: 400 });
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect Spotify to control playback." },
      { status: 401 },
    );
  }

  try {
    await addSpotifyQueueTrack(accessToken, trackUri);
    return NextResponse.json({ queued: true });
  } catch (error) {
    const message =
      error instanceof SpotifyApiError && error.status === 404
        ? "No active Spotify device. Open Spotify and start playing something first."
        : error instanceof SpotifyApiError && error.status === 403
          ? "Spotify queue control requires Premium and an eligible active device."
          : error instanceof Error
            ? error.message
            : "Unable to add the track to the queue.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
