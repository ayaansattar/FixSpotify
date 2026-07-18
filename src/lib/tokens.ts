import { db } from "@/lib/db";
import { refreshSpotifyToken } from "@/lib/spotify";

const TOKEN_ID = "spotify";

export async function saveAuthTokens(input: {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}) {
  await db.authToken.upsert({
    where: { id: TOKEN_ID },
    create: {
      id: TOKEN_ID,
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
    },
    update: {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      expiresAt: input.expiresAt,
    },
  });
}

export async function getValidAccessToken() {
  const stored = await db.authToken.findUnique({ where: { id: TOKEN_ID } });

  if (!stored) {
    return null;
  }

  if (stored.expiresAt.getTime() > Date.now() + 60_000) {
    return stored.accessToken;
  }

  const refreshed = await refreshSpotifyToken(stored.refreshToken);

  await saveAuthTokens({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken,
    expiresAt: refreshed.expiresAt,
  });

  return refreshed.accessToken;
}
