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
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Recently deleted</h1>
        <p className="mt-2 text-sm text-[#a7b0aa]">
          Tracks removed during the last seven days. Restore adds a track back
          to the end of its playlist. Older entries are cleared automatically.
        </p>
      </header>

      <DeletedTrackList
        initialTracks={tracks.map((track) => ({
          id: track.id,
          playlistName: track.playlistName,
          trackId: track.trackId,
          trackName: track.trackName,
          artistNames: track.artistNames,
          albumImageUrl: track.albumImageUrl,
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
