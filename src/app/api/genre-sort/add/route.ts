import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import {
  appendTrackToPlaylistCache,
  getCachedPlaylistTracks,
} from "@/lib/playlist-cache";
import {
  addSpotifyPlaylistItem,
  describeSpotifyError,
  SpotifyApiError,
  type SpotifyPlaylistTrack,
} from "@/lib/spotify";
import { getValidAccessToken } from "@/lib/tokens";

function parseArtistNames(value: unknown): SpotifyPlaylistTrack["artists"] {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ id: "", name }));
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    playlistId?: unknown;
    trackUri?: unknown;
    trackId?: unknown;
    trackName?: unknown;
    artistNames?: unknown;
    albumImageUrl?: unknown;
    isPlayable?: unknown;
  } | null;
  const playlistId = body?.playlistId;
  const trackUri = body?.trackUri;
  const trackId = body?.trackId;
  const trackName = body?.trackName;
  const albumImageUrl =
    typeof body?.albumImageUrl === "string" && body.albumImageUrl.length > 0
      ? body.albumImageUrl
      : null;

  if (
    typeof playlistId !== "string" ||
    playlistId.length === 0 ||
    playlistId.length > 100 ||
    typeof trackUri !== "string" ||
    !trackUri.startsWith("spotify:track:") ||
    trackUri.length > 100 ||
    typeof trackId !== "string" ||
    trackId.length === 0 ||
    trackId.length > 100 ||
    typeof trackName !== "string" ||
    trackName.length === 0 ||
    trackName.length > 500 ||
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
      { error: "Reconnect Spotify to add tracks." },
      { status: 401 },
    );
  }

  const track: SpotifyPlaylistTrack = {
    id: trackId,
    name: trackName,
    uri: trackUri,
    isPlayable: body?.isPlayable !== false,
    imageUrl: albumImageUrl,
    artists: parseArtistNames(body?.artistNames),
  };

  try {
    const playlistTracks = await getCachedPlaylistTracks(
      accessToken,
      playlistId,
    );
    const alreadyPresent = playlistTracks.some(
      (entry) => entry.uri === trackUri || entry.id === trackId,
    );

    if (!alreadyPresent) {
      await addSpotifyPlaylistItem(accessToken, playlistId, trackUri);
      // Keep the warm cache instead of wiping it (avoids re-paging on every move).
      await appendTrackToPlaylistCache(playlistId, track);
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
