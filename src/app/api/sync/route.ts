import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { syncRecentlyPlayed } from "@/lib/sync";
import { getValidAccessToken } from "@/lib/tokens";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "Spotify session expired. Sign out and reconnect." },
      { status: 401 },
    );
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return NextResponse.json(
      { error: "No Spotify access token available. Sign in again." },
      { status: 401 },
    );
  }

  try {
    const result = await syncRecentlyPlayed(accessToken);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Manual sync failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Sync failed" },
      { status: 500 },
    );
  }
}
