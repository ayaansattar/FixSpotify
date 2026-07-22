import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    playlistId?: unknown;
    trackId?: unknown;
    trackName?: unknown;
    artistNames?: unknown;
    note?: unknown;
  } | null;

  const playlistId = body?.playlistId;
  const trackId = body?.trackId;
  const trackName = body?.trackName;
  const artistNames = body?.artistNames;
  const note = body?.note;

  if (
    typeof playlistId !== "string" ||
    playlistId.length === 0 ||
    playlistId.length > 100 ||
    typeof trackId !== "string" ||
    trackId.length === 0 ||
    trackId.length > 100 ||
    typeof trackName !== "string" ||
    trackName.length === 0 ||
    trackName.length > 500 ||
    typeof artistNames !== "string" ||
    artistNames.length > 1000 ||
    typeof note !== "string" ||
    note.trim().length === 0 ||
    note.length > 2000
  ) {
    return NextResponse.json({ error: "Invalid note." }, { status: 400 });
  }

  const saved = await db.playlistTrackNote.upsert({
    where: {
      playlistId_trackId: { playlistId, trackId },
    },
    create: {
      playlistId,
      trackId,
      trackName,
      artistNames,
      note: note.trim(),
    },
    update: {
      trackName,
      artistNames,
      note: note.trim(),
    },
  });

  // Changing a note invalidates Gemini cache for this source playlist.
  await db.aiSortCache.deleteMany({ where: { sourcePlaylistId: playlistId } });

  return NextResponse.json({ saved: true, id: saved.id });
}

export async function DELETE(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    playlistId?: unknown;
    trackId?: unknown;
  } | null;

  const playlistId = body?.playlistId;
  const trackId = body?.trackId;

  if (
    typeof playlistId !== "string" ||
    playlistId.length === 0 ||
    typeof trackId !== "string" ||
    trackId.length === 0
  ) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  await db.playlistTrackNote.deleteMany({
    where: { playlistId, trackId },
  });
  await db.aiSortCache.deleteMany({ where: { sourcePlaylistId: playlistId } });

  return NextResponse.json({ deleted: true });
}
