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
    playlistIds?: unknown;
  } | null;
  const playlistIds = body?.playlistIds;

  if (
    !Array.isArray(playlistIds) ||
    playlistIds.length === 0 ||
    playlistIds.length > 500 ||
    playlistIds.some(
      (playlistId) =>
        typeof playlistId !== "string" ||
        playlistId.length === 0 ||
        playlistId.length > 100,
    )
  ) {
    return NextResponse.json(
      { error: "Select between 1 and 500 playlists." },
      { status: 400 },
    );
  }

  const uniqueIds = [...new Set(playlistIds)];

  if (uniqueIds.length !== playlistIds.length) {
    return NextResponse.json(
      { error: "A playlist can only be selected once." },
      { status: 400 },
    );
  }

  await db.$transaction([
    db.playlistPreference.deleteMany(),
    db.playlistPreference.createMany({
      data: uniqueIds.map((playlistId, position) => ({
        playlistId,
        position,
      })),
    }),
  ]);

  return NextResponse.json({ saved: uniqueIds.length });
}
