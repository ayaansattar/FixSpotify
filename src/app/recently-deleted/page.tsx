import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DeletedTrackList } from "@/components/deleted-track-list";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function RecentlyDeleted() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  const tracks = await getRecentDeletions();

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1ed760]">
            Spotify Manager
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">
            Recently deleted
          </h1>
          <p className="mt-2 text-sm text-[#a7b0aa]">
            Tracks removed during the last seven days. Restore adds a track back
            to the end of its playlist. Older entries are cleared automatically.
          </p>
        </div>
        <Link
          className="text-sm text-[#a7b0aa] hover:text-white"
          href="/dashboard"
        >
          Dashboard
        </Link>
      </header>

      <DeletedTrackList
        initialTracks={tracks.map((track) => ({
          id: track.id,
          playlistName: track.playlistName,
          trackId: track.trackId,
          trackName: track.trackName,
          artistNames: track.artistNames,
          deletedAt: track.deletedAt.toISOString(),
        }))}
      />
    </main>
  );
}

async function getRecentDeletions() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  return db.deletedTrack.findMany({
    where: {
      deletedAt: {
        gte: cutoff,
      },
    },
    orderBy: {
      deletedAt: "desc",
    },
  });
}
