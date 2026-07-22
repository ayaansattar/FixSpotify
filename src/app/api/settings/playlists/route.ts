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
    playlists?: unknown;
    playlistIds?: unknown;
  } | null;

  const playlists = normalizePlaylists(body);
  if (!playlists) {
    return NextResponse.json(
      { error: "Select between 1 and 500 playlists." },
      { status: 400 },
    );
  }

  const uniqueIds = playlists.map((playlist) => playlist.id);
  if (new Set(uniqueIds).size !== uniqueIds.length) {
    return NextResponse.json(
      { error: "A playlist can only be selected once." },
      { status: 400 },
    );
  }

  const existing = await db.playlistPreference.findMany();
  const existingById = new Map(
    existing.map((pref) => [pref.playlistId, pref.description] as const),
  );

  await db.$transaction([
    db.playlistPreference.deleteMany(),
    db.playlistPreference.createMany({
      data: playlists.map((playlist, position) => ({
        playlistId: playlist.id,
        position,
        description:
          playlist.description.trim() ||
          existingById.get(playlist.id)?.trim() ||
          "",
      })),
    }),
  ]);

  return NextResponse.json({ saved: playlists.length });
}

function normalizePlaylists(
  body: {
    playlists?: unknown;
    playlistIds?: unknown;
  } | null,
): Array<{ id: string; description: string }> | null {
  if (Array.isArray(body?.playlists)) {
    const playlists: Array<{ id: string; description: string }> = [];

    for (const entry of body.playlists) {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const record = entry as Record<string, unknown>;
      if (
        typeof record.id !== "string" ||
        record.id.length === 0 ||
        record.id.length > 100
      ) {
        return null;
      }

      const description =
        typeof record.description === "string" ? record.description : "";
      if (description.length > 4000) {
        return null;
      }

      playlists.push({ id: record.id, description });
    }

    if (playlists.length === 0 || playlists.length > 500) {
      return null;
    }

    return playlists;
  }

  if (!Array.isArray(body?.playlistIds) || body.playlistIds.length === 0) {
    return null;
  }

  const playlists: Array<{ id: string; description: string }> = [];
  for (const playlistId of body.playlistIds) {
    if (
      typeof playlistId !== "string" ||
      playlistId.length === 0 ||
      playlistId.length > 100
    ) {
      return null;
    }

    playlists.push({ id: playlistId, description: "" });
  }

  if (playlists.length > 500) {
    return null;
  }

  return playlists;
}
