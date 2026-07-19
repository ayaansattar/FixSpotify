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

type RecentlyPlayedItem = {
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

type Page<T> = {
  items: T[];
  total: number;
};

export type SpotifyPlaylist = {
  id: string;
  name: string;
  owner?: {
    id: string;
  };
};

export type SpotifyPlaylistTrack = {
  id: string;
  name: string;
  uri: string;
  isPlayable: boolean;
  availabilityReason?: string;
  artists: Array<{
    id: string;
    name: string;
  }>;
};

type SpotifyApiPlaylistTrack = Omit<
  SpotifyPlaylistTrack,
  "isPlayable" | "availabilityReason"
> & {
  is_playable?: boolean;
  is_local?: boolean;
  restrictions?: {
    reason?: string;
  };
};

type PlaylistItem = {
  item?: SpotifyApiPlaylistTrack | null;
  track?: SpotifyApiPlaylistTrack | null;
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

export function describeSpotifyError(error: unknown, fallback: string) {
  if (error instanceof SpotifyApiError) {
    if (error.status === 429) {
      const waitMinutes = error.retryAfterMs
        ? Math.ceil(error.retryAfterMs / 60_000)
        : null;
      return waitMinutes
        ? `Spotify is rate limiting this app. Try again in about ${waitMinutes} minute${waitMinutes === 1 ? "" : "s"}.`
        : "Spotify is rate limiting this app. Try again in a few minutes.";
    }

    if (error.status === 403) {
      return "Spotify only allows this app to inspect playlists you own or collaborate on.";
    }
  }

  return error instanceof Error ? error.message : fallback;
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

async function spotifyFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
  retries = 3,
): Promise<T> {
  const response = await fetch(`${SPOTIFY_API}${path}`, {
    cache: "no-store",
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

    // Only wait-and-retry for short limits. Long Retry-After values (Spotify
    // can demand hours) would hang page renders; surface an error instead.
    if (retryAfterMs <= 5_000) {
      await sleep(retryAfterMs);
      return spotifyFetch(accessToken, path, init, retries - 1);
    }

    throw new SpotifyApiError(
      `Spotify API 429 for ${path}`,
      429,
      retryAfterMs,
    );
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

export async function getCurrentSpotifyUser(accessToken: string) {
  return spotifyFetch<{ id: string }>(accessToken, "/me");
}

export async function getCurrentUserPlaylists(accessToken: string) {
  const playlists: SpotifyPlaylist[] = [];
  const limit = 50;
  let offset = 0;

  while (true) {
    const page = await spotifyFetch<Page<SpotifyPlaylist>>(
      accessToken,
      `/me/playlists?limit=${limit}&offset=${offset}`,
    );

    playlists.push(...page.items.filter(Boolean));
    offset += page.items.length;

    if (page.items.length === 0 || offset >= page.total) {
      break;
    }
  }

  return playlists;
}

export async function getPlaylistTracks(
  accessToken: string,
  playlistId: string,
) {
  const limit = 50;
  // Trim the response to just the fields we use; full playlist item payloads
  // include album art, markets, etc. and are ~50x larger. Both `item` and
  // `track` keys are requested to cover the 2026 field rename.
  const fields = encodeURIComponent(
    "total,items(item(id,name,uri,is_playable,is_local,restrictions(reason),artists(id,name)),track(id,name,uri,is_playable,is_local,restrictions(reason),artists(id,name)))",
  );
  const basePath = `/playlists/${encodeURIComponent(playlistId)}/items?fields=${fields}&market=from_token&limit=${limit}`;

  const firstPage = await spotifyFetch<Page<PlaylistItem>>(
    accessToken,
    `${basePath}&offset=0`,
  );

  const pages = [firstPage.items];
  const remainingOffsets: number[] = [];

  for (let offset = limit; offset < firstPage.total; offset += limit) {
    remainingOffsets.push(offset);
  }

  // Fetch remaining pages in small parallel batches: fast for large
  // playlists without hammering Spotify's rate limit.
  const batchSize = 5;

  for (let i = 0; i < remainingOffsets.length; i += batchSize) {
    const batch = remainingOffsets.slice(i, i + batchSize);
    const results = await Promise.all(
      batch.map((offset) =>
        spotifyFetch<Page<PlaylistItem>>(
          accessToken,
          `${basePath}&offset=${offset}`,
        ),
      ),
    );

    for (const page of results) {
      pages.push(page.items);
    }
  }

  const tracks: SpotifyPlaylistTrack[] = [];

  for (const pageItems of pages) {
    for (const playlistItem of pageItems) {
      const item = playlistItem.item ?? playlistItem.track;

      if (item?.id && item.uri && item.artists) {
        tracks.push({
          id: item.id,
          name: item.name,
          uri: item.uri,
          artists: item.artists,
          isPlayable:
            item.is_playable !== false &&
            item.is_local !== true &&
            !item.restrictions?.reason,
          availabilityReason: item.restrictions?.reason,
        });
      }
    }
  }

  return tracks;
}

export async function startSpotifyPlayback(
  accessToken: string,
  trackUris: string | string[],
) {
  const uris = Array.isArray(trackUris) ? trackUris : [trackUris];

  if (uris.length === 0) {
    throw new Error("No tracks to play.");
  }

  await spotifyFetch<void>(accessToken, "/me/player/play", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      uris,
      position_ms: 0,
    }),
  });
}

export async function setSpotifyShuffle(accessToken: string, state: boolean) {
  await spotifyFetch<void>(
    accessToken,
    `/me/player/shuffle?state=${state ? "true" : "false"}`,
    {
      method: "PUT",
    },
  );
}

export async function removeSpotifyPlaylistItem(
  accessToken: string,
  playlistId: string,
  trackUri: string,
) {
  return spotifyFetch<{ snapshot_id: string }>(
    accessToken,
    `/playlists/${encodeURIComponent(playlistId)}/items`,
    {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [{ uri: trackUri }],
      }),
    },
  );
}

export async function addSpotifyPlaylistItem(
  accessToken: string,
  playlistId: string,
  trackUri: string,
) {
  return spotifyFetch<{ snapshot_id: string }>(
    accessToken,
    `/playlists/${encodeURIComponent(playlistId)}/items`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        uris: [trackUri],
      }),
    },
  );
}
