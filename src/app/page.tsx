import { getServerSession } from "next-auth";

import { FeatureShowcase } from "@/components/feature-showcase";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const features = [
  {
    id: "least-listened",
    title: "Least listened",
    description:
      "Rank playlist tracks by plays over 6 months, 1 year, or lifetime. Find forgotten songs, play them, or clean them out.",
    demoSrc: "/demos/least-listened.webm",
    href: "/dashboard",
  },
  {
    id: "fair-shuffle",
    title: "Fair shuffle",
    description:
      "Fisher–Yates order, weighted least-played shuffle, or a no-repeat deck — then play the exact order on your Spotify device.",
    demoSrc: "/demos/fair-shuffle.webm",
    href: "/shuffle",
  },
  {
    id: "playlist-sort",
    title: "Playlist sort",
    description:
      "Gemini checks each track against your playlist intents and artist-cohesion rules, then suggests a better home when something looks misfiled.",
    demoSrc: "/demos/playlist-sort.webm",
    href: "/genre-sort",
  },
  {
    id: "recently-deleted",
    title: "Recently deleted",
    description:
      "Removals stick around for seven days so you can restore a track without hunting through Spotify history.",
    demoSrc: "/demos/recently-deleted.webm",
    href: "/recently-deleted",
  },
  {
    id: "playlists",
    title: "Your playlists",
    description:
      "Pick and order which owned playlists appear in the app, and write short intents that power AI playlist sort.",
    demoSrc: "/demos/playlists.webm",
    href: "/settings/playlists",
  },
] as const;

export default async function Home() {
  const session = await getServerSession(authOptions);
  const isSignedIn = Boolean(session?.user);
  const totalPlays = isSignedIn ? await db.play.count() : 0;

  return (
    <main className="-mt-4 min-h-screen bg-black sm:-mt-6">
      <FeatureShowcase
        features={[...features]}
        isSignedIn={isSignedIn}
        totalPlays={totalPlays}
        userLabel={session?.user?.name ?? session?.user?.email}
      />
    </main>
  );
}
