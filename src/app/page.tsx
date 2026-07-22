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
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1ed760]/25 bg-[#1ed760]/10 px-3 py-1 text-sm font-medium text-[#8cf0ae]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1ed760]" />
                {session.user.name ?? session.user.email}
              </span>
              <span className="text-sm tabular-nums text-[#a7b0aa]">
                {totalPlays.toLocaleString()} play{totalPlays === 1 ? "" : "s"}{" "}
                logged
              </span>
            </div>
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
        </div>

        {session?.user ? (
          <nav className="mt-10 grid gap-3 sm:grid-cols-3">
            <HomeCard
              description="Surface the tracks you skip past, ranked by plays."
              href="/dashboard"
              title="Least listened"
            />
            <HomeCard
              description="True uniform shuffle with an optional no-repeat deck."
              href="/shuffle"
              title="Fair shuffle"
            />
            <HomeCard
              description="Spot misfits using playlist intent, artist cohesion, and Gemini."
              href="/genre-sort"
              title="Playlist sort"
            />
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function HomeCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 hover:border-[#1ed760]/40 hover:bg-[#1ed760]/[0.06]"
      href={href}
    >
      <p className="flex items-center justify-between font-semibold">
        {title}
        <span className="text-[#1ed760] transition-transform duration-150 group-hover:translate-x-0.5">
          →
        </span>
      </p>
      <p className="mt-1.5 text-sm leading-6 text-[#a7b0aa]">{description}</p>
    </Link>
  );
}
