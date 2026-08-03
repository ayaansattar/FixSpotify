"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useEffect, useState } from "react";

import { SyncButton } from "@/components/sync-button";

export type ShowcaseFeature = {
  id: string;
  title: string;
  description: string;
  /** Optional looping demo under /public/demos */
  demoSrc?: string | null;
  /** Poster / first-frame image if available */
  posterSrc?: string | null;
  href?: string;
};

type FeatureShowcaseProps = {
  features: ShowcaseFeature[];
  isSignedIn: boolean;
  userLabel?: string | null;
  totalPlays?: number;
};

export function FeatureShowcase({
  features,
  isSignedIn,
  userLabel,
  totalPlays = 0,
}: FeatureShowcaseProps) {
  const [activeId, setActiveId] = useState(features[0]?.id ?? "");
  const active =
    features.find((feature) => feature.id === activeId) ?? features[0];

  if (!active) {
    return null;
  }

  return (
    <section className="min-h-[calc(100vh-5.5rem)] w-full bg-black text-white">
      <div className="mx-auto grid min-h-[calc(100vh-5.5rem)] w-full max-w-7xl gap-8 px-4 py-8 sm:px-8 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:py-10">
        {/* Left: feature list */}
        <div className="flex min-w-0 flex-col justify-center order-2 lg:order-1">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-[#1ed760]">
            What FixSpotify does
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            A quieter way to run your playlists.
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#a7b0aa] sm:text-base">
            Tour the product below
            {isSignedIn ? ", then jump into any tool from the header." : ", then connect Spotify to use it."}
          </p>

          {isSignedIn ? (
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm text-[#a7b0aa]">
              <span className="inline-flex items-center gap-2 rounded-full border border-[#1ed760]/25 bg-[#1ed760]/10 px-3 py-1 font-medium text-[#8cf0ae]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1ed760]" />
                {userLabel ?? "Connected"}
              </span>
              <span className="tabular-nums">
                {totalPlays.toLocaleString()} play
                {totalPlays === 1 ? "" : "s"} logged
              </span>
            </div>
          ) : null}

          <ul className="mt-8 space-y-2.5">
            {features.map((feature) => {
              const isActive = feature.id === active.id;
              return (
                <li key={feature.id}>
                  <button
                    aria-expanded={isActive}
                    className={`w-full cursor-pointer rounded-[1.5rem] border text-left transition-[background-color,border-color,transform] duration-300 ${
                      isActive
                        ? "border-white/15 bg-[#1c1c1e] px-5 py-4"
                        : "border-white/10 bg-white/[0.04] px-4 py-3 hover:bg-white/[0.07]"
                    }`}
                    onClick={() => setActiveId(feature.id)}
                    type="button"
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-sm transition-colors ${
                          isActive
                            ? "border-white/40 bg-white font-semibold text-black"
                            : "border-white/30 text-white"
                        }`}
                      >
                        {isActive ? "•" : "+"}
                      </span>
                      <span className="text-[0.98rem] font-semibold tracking-tight">
                        {feature.title}
                      </span>
                    </span>

                    <div
                      className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                        isActive
                          ? "mt-3 grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="text-sm leading-6 text-[#b0b0b5]">
                          {feature.description}
                        </p>
                        {isActive && feature.href && isSignedIn ? (
                          <Link
                            className="mt-3 inline-flex text-sm font-medium text-[#1ed760] hover:text-[#8cf0ae]"
                            href={feature.href}
                          >
                            Open {feature.title} →
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {isSignedIn ? (
              <>
                <Link
                  className="rounded-full bg-[#1ed760] px-6 py-3 text-sm font-semibold text-[#07150c] hover:opacity-90"
                  href="/dashboard"
                >
                  Open dashboard
                </Link>
                <SyncButton />
              </>
            ) : (
              <button
                className="cursor-pointer rounded-full bg-[#1ed760] px-6 py-3 text-sm font-semibold text-[#07150c] hover:opacity-90"
                onClick={() => void signIn("spotify")}
                type="button"
              >
                Connect Spotify
              </button>
            )}
            <p className="max-w-xs text-xs leading-5 text-[#69736d]">
              {isSignedIn
                ? "This tour stays available anytime from the FixSpotify logo."
                : "Private single-user app — explore first, then connect."}
            </p>
          </div>
        </div>

        {/* Right: demo / hero */}
        <div className="relative flex min-h-[16rem] items-center justify-center order-1 lg:order-2 lg:min-h-[28rem]">
          <FeatureMedia feature={active} key={active.id} />
        </div>
      </div>
    </section>
  );
}

function FeatureMedia({ feature }: { feature: ShowcaseFeature }) {
  const [failed, setFailed] = useState(!feature.demoSrc);

  useEffect(() => {
    setFailed(!feature.demoSrc);
  }, [feature.demoSrc, feature.id]);

  if (!feature.demoSrc || failed) {
    return <DemoPlaceholder feature={feature} />;
  }

  const isVideo = /\.(webm|mp4|mov)(\?|$)/i.test(feature.demoSrc);

  if (isVideo) {
    return (
      <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black/50">
        <video
          autoPlay
          className="aspect-[16/10] h-auto w-full object-cover"
          key={feature.demoSrc}
          loop
          muted
          onError={() => setFailed(true)}
          playsInline
          poster={feature.posterSrc ?? undefined}
          src={feature.demoSrc}
        />
      </div>
    );
  }

  return (
    <div className="relative w-full overflow-hidden rounded-[2rem] border border-white/10 bg-[#0a0a0a] shadow-2xl shadow-black/50">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="aspect-[16/10] h-auto w-full object-cover"
        key={feature.demoSrc}
        onError={() => setFailed(true)}
        src={feature.demoSrc}
      />
    </div>
  );
}

function DemoPlaceholder({ feature }: { feature: ShowcaseFeature }) {
  return (
    <div className="relative flex aspect-[16/10] w-full flex-col justify-between overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(ellipse_at_30%_20%,rgb(30_215_96_/_18%),transparent_50%),#0a0a0a] p-8 shadow-2xl shadow-black/50 sm:p-10">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#1ed760]">
          Feature preview
        </p>
        <h2 className="mt-3 max-w-lg text-2xl font-semibold tracking-tight sm:text-3xl">
          {feature.title}
        </h2>
        <p className="mt-3 max-w-md text-sm leading-7 text-[#a7b0aa]">
          {feature.description}
        </p>
      </div>

      <div className="mt-8 rounded-2xl border border-dashed border-white/15 bg-white/[0.03] px-5 py-4">
        <p className="text-sm font-medium text-white/90">Demo slot ready</p>
        <p className="mt-1 text-xs leading-5 text-[#69736d] sm:text-sm">
          Drop a short looping screen recording at{" "}
          <code className="rounded bg-white/10 px-1.5 py-0.5 text-[#8cf0ae]">
            public/demos/{feature.id}.webm
          </code>{" "}
          (or .mp4 / .gif).
        </p>
      </div>

      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 top-10 hidden h-40 w-64 rounded-2xl border border-white/10 bg-white/[0.04] blur-[0.5px] sm:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-2 top-24 hidden h-28 w-48 rounded-2xl border border-[#1ed760]/20 bg-[#1ed760]/10 sm:block"
      />
    </div>
  );
}
