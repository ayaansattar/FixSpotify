import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import SpotifyProvider from "next-auth/providers/spotify";

import { saveAuthTokens } from "@/lib/tokens";

const scopes = [
  "user-read-email",
  "user-read-private",
  "user-read-recently-played",
  "user-top-read",
  "playlist-read-private",
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-playback-state",
  "user-modify-playback-state",
  "streaming",
].join(" ");

async function persistToken(token: JWT) {
  if (!token.accessToken || !token.refreshToken || !token.accessTokenExpires) {
    return;
  }

  try {
    await saveAuthTokens({
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresAt: new Date(token.accessTokenExpires),
    });
  } catch (error) {
    console.error("Unable to persist Spotify tokens for cron sync", error);
  }
}

async function refreshAccessToken(token: JWT): Promise<JWT> {
  if (!token.refreshToken) {
    return { ...token, error: "RefreshAccessTokenError" };
  }

  try {
    const credentials = Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
    ).toString("base64");

    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = (await response.json()) as {
      access_token?: string;
      expires_in?: number;
      refresh_token?: string;
      error_description?: string;
    };

    if (!response.ok || !refreshed.access_token || !refreshed.expires_in) {
      throw new Error(refreshed.error_description ?? "Spotify token refresh failed");
    }

    const nextToken: JWT = {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      error: undefined,
    };

    await persistToken(nextToken);
    return nextToken;
  } catch (error) {
    console.error("Unable to refresh Spotify access token", error);
    return { ...token, error: "RefreshAccessTokenError" };
  }
}

export const authOptions = {
  providers: [
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID ?? "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: scopes,
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account?.access_token && account.refresh_token) {
        const nextToken: JWT = {
          ...token,
          accessToken: account.access_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + 3_600_000,
          refreshToken: account.refresh_token,
        };

        await persistToken(nextToken);
        return nextToken;
      }

      if (
        token.accessTokenExpires &&
        Date.now() < token.accessTokenExpires - 60_000
      ) {
        return token;
      }

      return refreshAccessToken(token);
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
} satisfies NextAuthOptions;
