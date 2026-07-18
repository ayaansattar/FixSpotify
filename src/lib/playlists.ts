import { db } from "@/lib/db";
import {
  getCurrentSpotifyUser,
  getCurrentUserPlaylists,
  type SpotifyPlaylist,
} from "@/lib/spotify";

export async function getPreferredPlaylists(accessToken: string) {
  const [spotifyUser, allPlaylists, preferences] = await Promise.all([
    getCurrentSpotifyUser(accessToken),
    getCurrentUserPlaylists(accessToken),
    db.playlistPreference.findMany({
      orderBy: {
        position: "asc",
      },
    }),
  ]);

  const ownedPlaylists = allPlaylists
    .filter((playlist) => playlist.owner?.id === spotifyUser.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const ownedById = new Map(
    ownedPlaylists.map((playlist) => [playlist.id, playlist]),
  );
  const preferredPlaylists = preferences
    .map((preference) => ownedById.get(preference.playlistId))
    .filter((playlist): playlist is SpotifyPlaylist => Boolean(playlist));

  return preferences.length > 0 ? preferredPlaylists : ownedPlaylists;
}
