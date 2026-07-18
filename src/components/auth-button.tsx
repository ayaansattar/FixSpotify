"use client";

import { signIn, signOut } from "next-auth/react";

type AuthButtonProps = {
  isSignedIn: boolean;
};

export function AuthButton({ isSignedIn }: AuthButtonProps) {
  return (
    <button
      className="cursor-pointer rounded-full bg-[#1ed760] px-6 py-3 font-semibold text-[#07150c] hover:opacity-90"
      onClick={() =>
        isSignedIn ? void signOut() : void signIn("spotify")
      }
      type="button"
    >
      {isSignedIn ? "Sign out" : "Connect Spotify"}
    </button>
  );
}
