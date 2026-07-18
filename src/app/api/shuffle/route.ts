import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getPlaylistTracks,
  setSpotifyShuffle,
  SpotifyApiError,
  startSpotifyPlayback,
} from "@/lib/spotify";
import { fisherYatesShuffle } from "@/lib/shuffle";
import { getValidAccessToken } from "@/lib/tokens";

/** Safe batch size for /me/player/play to avoid 413 payload errors. */
const PLAY_BATCH = 100;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    playlistId?: unknown;
    play?: unknown;
    reset?: unknown;
  } | null;
  const mode = body?.mode === "fresh" ? "fresh" : "deck";
  const playlistId = body?.playlistId;
  const shouldPlay = body?.play !== false;
  const resetDeck = body?.reset === true;

  if (
    typeof playlistId !== "string" ||
    playlistId.length === 0 ||
    playlistId.length > 100
  ) {
    return NextResponse.json({ error: "Invalid playlist." }, { status: 400 });
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect Spotify to shuffle and play." },
      { status: 401 },
    );
  }

  try {
    const playlistTracks = await getPlaylistTracks(accessToken, playlistId);
    const uniqueTracks = Array.from(
      new Map(playlistTracks.map((track) => [track.id, track])).values(),
    );

    if (uniqueTracks.length === 0) {
      return NextResponse.json(
        { error: "This playlist has no playable tracks." },
        { status: 400 },
      );
    }

    const allTrackIds = new Set(uniqueTracks.map((track) => track.id));
    let usedTrackIds: string[] = [];
    let cycleStarted = false;

    if (mode === "deck" && !resetDeck) {
      const deck = await db.shuffleDeck.findUnique({
        where: { playlistId },
      });
      cycleStarted = !deck;
      usedTrackIds = parseTrackIds(deck?.usedTrackIds).filter((trackId) =>
        allTrackIds.has(trackId),
      );
    }

    if (
      mode === "deck" &&
      (resetDeck || usedTrackIds.length >= uniqueTracks.length)
    ) {
      usedTrackIds = [];
      cycleStarted = true;
    }

    const usedSet = new Set(usedTrackIds);
    const candidates =
      mode === "deck"
        ? uniqueTracks.filter((track) => !usedSet.has(track.id))
        : uniqueTracks;
    const shuffled = fisherYatesShuffle([...candidates]);
    const playTracks = shuffled.slice(0, PLAY_BATCH);
    let playingCount = 0;

    if (shouldPlay) {
      // Turn off Spotify's own shuffle so our Fisher–Yates order is preserved.
      await setSpotifyShuffle(accessToken, false).catch(() => {
        // Non-fatal if no active device yet; play call will surface that.
      });

      // Note: the "add to queue" API can't extend this — Spotify inserts
      // queued tracks immediately after the current song, which breaks the
      // shuffled order. One clean batch is the reliable approach.
      const playUris = playTracks.map((track) => track.uri);
      await startSpotifyPlayback(accessToken, playUris);
      playingCount = playUris.length;

      if (mode === "deck") {
        await db.shuffleDeck.upsert({
          where: { playlistId },
          create: {
            playlistId,
            usedTrackIds: JSON.stringify([
              ...usedTrackIds,
              ...playTracks.map((track) => track.id),
            ]),
          },
          update: {
            usedTrackIds: JSON.stringify([
              ...usedTrackIds,
              ...playTracks.map((track) => track.id),
            ]),
          },
        });
      }
    }

    return NextResponse.json({
      cycleStarted,
      mode,
      playlistId,
      remaining:
        mode === "deck" ? Math.max(0, candidates.length - playTracks.length) : 0,
      total: uniqueTracks.length,
      playingCount,
      queuedCount: 0,
      tracks: (mode === "deck" ? playTracks : shuffled).map((track, index) => ({
        position: index + 1,
        id: track.id,
        name: track.name,
        uri: track.uri,
        artists: track.artists.map((artist) => artist.name).join(", "),
      })),
    });
  } catch (error) {
    const message =
      error instanceof SpotifyApiError && error.status === 404
        ? "No active Spotify device. Open Spotify and start playing something first."
        : error instanceof SpotifyApiError && error.status === 403
          ? "Spotify playback control requires Premium and an eligible active device."
          : error instanceof Error
            ? error.message
            : "Unable to shuffle playlist.";

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function parseTrackIds(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((trackId): trackId is string => typeof trackId === "string")
      : [];
  } catch {
    return [];
  }
}
