export default function DashboardLoading() {
  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-6 py-10 sm:py-16">
      <header className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#1ed760]">
          Spotify Manager
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">
          Least-listened tracks
        </h1>
      </header>

      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-6">
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#1ed760] border-t-transparent" />
        <p className="text-[#a7b0aa]">
          Loading playlist tracks from Spotify… large playlists can take a few
          seconds.
        </p>
      </div>

      <div className="mt-5 space-y-3">
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="h-16 animate-pulse rounded-2xl border border-white/5 bg-white/5"
            key={index}
          />
        ))}
      </div>
    </main>
  );
}
