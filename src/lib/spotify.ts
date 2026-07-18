const SPOTIFY_API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "SpotifyApiError";
  }
}

export type RecentlyPlayedItem = {
  played_at: string;
  track: {
    id: string;
    name: string;
    artists: Array<{ id: string; name: string }>;
  } | null;
};

type RecentlyPlayedResponse = {
  items: RecentlyPlayedItem[];
};

type TokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
  error_description?: string;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function refreshSpotifyToken(refreshToken: string) {
  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
  ).toString("base64");

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  const body = (await response.json()) as TokenResponse;

  if (!response.ok || !body.access_token || !body.expires_in) {
    throw new Error(body.error_description ?? "Spotify token refresh failed");
  }

  return {
    accessToken: body.access_token,
    expiresAt: new Date(Date.now() + body.expires_in * 1000),
    refreshToken: body.refresh_token ?? refreshToken,
  };
}

export async function spotifyFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  retries = 3,
): Promise<T> {
  const response = await fetch(`${SPOTIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });

  if (response.status === 429 && retries > 0) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10)
      : 1;
    const retryAfterMs =
      (Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 1) * 1000;

    await sleep(retryAfterMs);
    return spotifyFetch(accessToken, path, init, retries - 1);
  }

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterMs = retryAfterHeader
      ? Number.parseInt(retryAfterHeader, 10) * 1000
      : undefined;

    throw new SpotifyApiError(
      `Spotify API ${response.status} for ${path}`,
      response.status,
      retryAfterMs,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export async function getRecentlyPlayed(accessToken: string, limit = 50) {
  return spotifyFetch<RecentlyPlayedResponse>(
    accessToken,
    `/me/player/recently-played?limit=${limit}`,
  );
}
