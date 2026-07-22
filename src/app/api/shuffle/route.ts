import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getCachedPlaylistTracks } from "@/lib/playlist-cache";
import { getPlayCounts } from "@/lib/play-counts";
import {
  describeSpotifyError,
  setSpotifyShuffle,
  SpotifyApiError,
  startSpotifyPlayback,
} from "@/lib/spotify";
import { fisherYatesShuffle, weightedRandomOrder } from "@/lib/shuffle";
import { getValidAccessToken } from "@/lib/tokens";

/** Safe batch size for /me/player/play to avoid 413 payload errors. */
const PLAY_BATCH = 100;
const MAX_PLAYLISTS = 50;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    mode?: unknown;
    playlistId?: unknown;
    playlistIds?: unknown;
    play?: unknown;
    reset?: unknown;
  } | null;
  const mode =
    body?.mode === "fresh"
      ? "fresh"
      : body?.mode === "weighted"
        ? "weighted"
        : "deck";
  const playlistIds = parsePlaylistIds(body);
  const shouldPlay = body?.play !== false;
  const resetDeck = body?.reset === true;

  if (!playlistIds) {
    return NextResponse.json({ error: "Invalid playlist." }, { status: 400 });
  }

  const deckKey = shuffleDeckKey(playlistIds);
  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Reconnect Spotify to shuffle and play." },
      { status: 401 },
    );
  }

  try {
    const playlistTrackLists = await Promise.all(
      playlistIds.map((playlistId) =>
        getCachedPlaylistTracks(accessToken, playlistId),
      ),
    );
    const uniqueTracks = Array.from(
      new Map(
        playlistTrackLists
          .flat()
          .filter((track) => track.isPlayable)
          .map((track) => [track.id, track]),
      ).values(),
    );

    if (uniqueTracks.length === 0) {
      return NextResponse.json(
        {
          error:
            playlistIds.length > 1
              ? "These playlists have no playable tracks."
              : "This playlist has no playable tracks.",
        },
        { status: 400 },
      );
    }

    const allTrackIds = new Set(uniqueTracks.map((track) => track.id));
    let usedTrackIds: string[] = [];

    if (mode === "deck" && !resetDeck) {
      const deck = await db.shuffleDeck.findUnique({
        where: { playlistId: deckKey },
      });
      usedTrackIds = parseTrackIds(deck?.usedTrackIds).filter((trackId) =>
        allTrackIds.has(trackId),
      );
    }

    if (
      mode === "deck" &&
      (resetDeck || usedTrackIds.length >= uniqueTracks.length)
    ) {
      usedTrackIds = [];
    }

    const usedSet = new Set(usedTrackIds);
    const candidates =
      mode === "deck"
        ? uniqueTracks.filter((track) => !usedSet.has(track.id))
        : uniqueTracks;
    const playCounts =
      mode === "weighted"
        ? await getPlayCounts(
            candidates.map((track) => ({
              id: track.id,
              name: track.name,
              artistIds: track.artists
                .map((artist) => artist.id)
                .filter(Boolean),
              artistNames: track.artists
                .map((artist) => artist.name)
                .filter(Boolean),
            })),
            null,
            accessToken,
          )
        : new Map<string, number>();
    const shuffled =
      mode === "weighted"
        ? weightedRandomOrder(
            [...candidates],
            (track) => 1 / ((playCounts.get(track.id) ?? 0) + 1),
          )
        : fisherYatesShuffle([...candidates]);
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
          where: { playlistId: deckKey },
          create: {
            playlistId: deckKey,
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
      mode,
      playlistIds,
      remaining:
        mode === "deck" ? Math.max(0, candidates.length - playTracks.length) : 0,
      total: uniqueTracks.length,
      playingCount,
      tracks: (mode === "deck" ? playTracks : shuffled).map((track, index) => ({
        position: index + 1,
        id: track.id,
        name: track.name,
        uri: track.uri,
        artists: track.artists.map((artist) => artist.name).join(", "),
        imageUrl: track.imageUrl,
        playCount:
          mode === "weighted" ? (playCounts.get(track.id) ?? 0) : undefined,
      })),
    });
  } catch (error) {
    const message =
      error instanceof SpotifyApiError && error.status === 404
        ? "No active Spotify device. Open Spotify and start playing something first."
        : error instanceof SpotifyApiError && error.status === 403
          ? "Spotify playback control requires Premium and an eligible active device."
          : describeSpotifyError(error, "Unable to shuffle playlist.");

    return NextResponse.json({ error: message }, { status: 502 });
  }
}

function parsePlaylistIds(body: {
  playlistId?: unknown;
  playlistIds?: unknown;
} | null): string[] | null {
  const fromArray = Array.isArray(body?.playlistIds)
    ? body.playlistIds.filter(
        (id): id is string =>
          typeof id === "string" && id.length > 0 && id.length <= 100,
      )
    : [];
  const unique =
    fromArray.length > 0
      ? Array.from(new Set(fromArray))
      : typeof body?.playlistId === "string" &&
          body.playlistId.length > 0 &&
          body.playlistId.length <= 100
        ? [body.playlistId]
        : [];

  if (unique.length === 0 || unique.length > MAX_PLAYLISTS) {
    return null;
  }

  return unique;
}

/** Stable ShuffleDeck PK for one playlist or a multi-playlist mix. */
function shuffleDeckKey(playlistIds: string[]) {
  if (playlistIds.length === 1) {
    return playlistIds[0];
  }

  return `mix:${[...playlistIds].sort().join(",")}`;
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
