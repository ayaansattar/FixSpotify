import Link from "next/link";
import { getServerSession } from "next-auth";

import { AuthButton } from "@/components/auth-button";
import { SyncButton } from "@/components/sync-button";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function Home() {
  const session = await getServerSession(authOptions);
  const totalPlays = session?.user ? await db.play.count() : 0;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur sm:p-12">
        <p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-[#1ed760]">
          Personal Spotify Manager
        </p>
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-6xl">
          Your listening data, under your control.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-8 text-[#a7b0aa]">
          Find forgotten tracks, clean up playlists, and shuffle without bias.
        </p>

        <div className="mt-10 flex flex-col items-start gap-4">
          {session?.user ? (
            <>
              <p className="text-lg">
                Signed in as{" "}
                <span className="font-semibold">
                  {session.user.name ?? session.user.email}
                </span>
              </p>
              <p className="text-sm text-[#a7b0aa]">
                {totalPlays} play{totalPlays === 1 ? "" : "s"} logged in SQLite.
              </p>
            </>
          ) : (
            <p className="text-[#a7b0aa]">
              Connect your account to start building your dashboard.
            </p>
          )}

          {session?.error === "RefreshAccessTokenError" ? (
            <p className="text-sm text-red-300">
              Your Spotify session expired. Sign out and reconnect your account.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <AuthButton isSignedIn={Boolean(session?.user)} />
            {session?.user ? <SyncButton /> : null}
          </div>
          {session?.user ? (
            <div className="mt-2 flex flex-col gap-2 text-sm font-semibold text-[#1ed760]">
              <Link href="/dashboard">Open least-listened dashboard →</Link>
              <Link href="/shuffle">Open fair shuffle →</Link>
              <Link href="/genre-sort">Open genre sort →</Link>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
