import Link from "next/link";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { InsightsCharts } from "@/components/insights-charts";
import { authOptions } from "@/lib/auth";
import { getInsightsData } from "@/lib/insights";
import { getValidAccessToken } from "@/lib/tokens";

export default async function InsightsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/signin");
  }

  const accessToken =
    session.accessToken ?? (await getValidAccessToken()) ?? null;

  if (!accessToken) {
    return (
      <InsightsShell>
        <p className="text-red-200">
          Sign out and reconnect Spotify to load listening insights.
        </p>
      </InsightsShell>
    );
  }

  const data = await getInsightsData(accessToken);

  if ("error" in data) {
    return (
      <InsightsShell>
        <p className="text-red-200">{data.error}</p>
      </InsightsShell>
    );
  }

  if (data.summary.preferredPlaylistCount === 0) {
    return (
      <InsightsShell>
        <p className="text-[#a7b0aa]">
          No playlists selected.{" "}
          <Link className="text-[#1ed760]" href="/settings/playlists">
            Choose playlists
          </Link>{" "}
          first, then return here.
        </p>
      </InsightsShell>
    );
  }

  return (
    <InsightsShell>
      <InsightsCharts data={data} />
    </InsightsShell>
  );
}

function InsightsShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-6xl px-6 py-10 sm:py-16">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Insights</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#a7b0aa]">
          Live charts from your listening history and preferred playlists —
          song/artist ranks, listening over time, and playlist health.
        </p>
      </header>
      {children}
    </main>
  );
}
