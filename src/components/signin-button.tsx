"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export function SignInButton() {
  const [loading, setLoading] = useState(false);

  return (
    <button
      className="inline-flex w-full cursor-pointer items-center justify-center gap-3 rounded-full bg-[#1ed760] px-8 py-4 text-lg font-semibold text-[#07150c] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      disabled={loading}
      onClick={() => {
        setLoading(true);
        void signIn("spotify", { callbackUrl: "/" });
      }}
      type="button"
    >
      {loading ? (
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#07150c] border-t-transparent" />
      ) : (
        <SpotifyMark />
      )}
      {loading ? "Redirecting to Spotify…" : "Continue with Spotify"}
    </button>
  );
}

function SpotifyMark() {
  return (
    <svg
      aria-hidden="true"
      className="h-6 w-6"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0Zm5.504 17.308a.748.748 0 0 1-1.029.248c-2.818-1.722-6.366-2.111-10.544-1.157a.748.748 0 1 1-.333-1.459c4.572-1.044 8.494-.594 11.658 1.34.353.215.463.676.248 1.028Zm1.47-3.267a.935.935 0 0 1-1.287.31c-3.226-1.983-8.143-2.557-11.958-1.399a.935.935 0 1 1-.543-1.79c4.358-1.322 9.776-.682 13.478 1.593.44.27.579.847.31 1.286Zm.126-3.403C15.233 8.34 8.892 8.128 5.2 9.249a1.122 1.122 0 1 1-.652-2.148c4.238-1.287 11.28-1.038 15.73 1.605a1.122 1.122 0 0 1-1.145 1.932Z" />
    </svg>
  );
}
