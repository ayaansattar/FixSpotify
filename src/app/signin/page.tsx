import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SignInButton } from "@/components/signin-button";
import { authOptions } from "@/lib/auth";

type SignInPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

const errorMessages: Record<string, string> = {
  OAuthCallback:
    "Spotify didn't complete the sign-in. This usually resolves if you try again.",
  OAuthSignin: "Couldn't start the Spotify sign-in. Try again in a moment.",
  AccessDenied:
    "Access was denied. Make sure your Spotify account is added as a user of this app in the Spotify Developer Dashboard.",
  Configuration:
    "The server's Spotify credentials are misconfigured. Check the environment variables.",
  SessionRequired: "Sign in to view that page.",
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/");
  }

  const params = await searchParams;
  const errorMessage = params.error
    ? (errorMessages[params.error] ??
      "Something went wrong during sign-in. Please try again.")
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg items-center px-6 py-16">
      <section className="w-full rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl backdrop-blur sm:p-10">
        <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#1ed760]">
          Personal Spotify Manager
        </p>
        <h1 className="mt-4 text-3xl font-bold tracking-tight">
          Welcome back
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-[#a7b0aa]">
          Sign in with your Spotify account to see your listening data,
          clean up playlists, and shuffle fairly.
        </p>

        {errorMessage ? (
          <p
            aria-live="polite"
            className="mt-6 rounded-xl border border-red-300/20 bg-red-300/5 px-4 py-3 text-sm text-red-200"
          >
            {errorMessage}
          </p>
        ) : null}

        <div className="mt-8">
          <SignInButton />
        </div>

        <ul className="mt-8 space-y-2 text-left text-sm text-[#a7b0aa]">
          <FeatureItem>Least-listened rankings from your full history</FeatureItem>
          <FeatureItem>Fair shuffle with a no-repeat deck</FeatureItem>
          <FeatureItem>Genre checks and playlist cleanup</FeatureItem>
        </ul>
      </section>
    </main>
  );
}

function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-4 py-2.5">
      <span aria-hidden="true" className="mt-0.5 text-[#1ed760]">
        ✓
      </span>
      {children}
    </li>
  );
}
