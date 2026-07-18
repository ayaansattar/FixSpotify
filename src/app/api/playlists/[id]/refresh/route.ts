import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { invalidatePlaylistTracksCache } from "@/lib/playlist-cache";

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

  const { id: playlistId } = await context.params;

  if (!playlistId || playlistId.length > 100) {
    return NextResponse.json({ error: "Invalid playlist." }, { status: 400 });
  }

  await invalidatePlaylistTracksCache(playlistId);

  return NextResponse.json({ invalidated: true });
}
