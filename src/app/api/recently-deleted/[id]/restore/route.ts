import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  addSpotifyPlaylistItem,
  getPlaylistTracks,
  SpotifyApiError,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const record = await db.deletedTrack.findUnique({ where: { id } });

  if (!record) {
    return NextResponse.json(
      { error: "This deletion record no longer exists." },
      { status: 404 },
    );
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect Spotify to restore tracks." },
      { status: 401 },
    );
  }

  try {
    const playlistTracks = await getPlaylistTracks(
      accessToken,
      record.playlistId,
    );
    const alreadyPresent = playlistTracks.some(
      (track) => track.id === record.trackId || track.uri === record.trackUri,
    );

    if (!alreadyPresent) {
      await addSpotifyPlaylistItem(
        accessToken,
        record.playlistId,
        record.trackUri,
      );
    }

    await db.deletedTrack.delete({ where: { id } });

    return NextResponse.json({
      restored: !alreadyPresent,
      alreadyPresent,
    });
  } catch (error) {
    const message =
      error instanceof SpotifyApiError && error.status === 403
        ? "Spotify did not allow this playlist to be edited."
        : error instanceof SpotifyApiError && error.status === 404
          ? "That playlist no longer exists on Spotify."
          : error instanceof Error
            ? error.message
            : "Unable to restore the track.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}
