"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/dashboard", label: "Least listened" },
  { href: "/shuffle", label: "Fair shuffle" },
  { href: "/genre-sort", label: "Genre sort" },
  { href: "/recently-deleted", label: "Recently deleted" },
  { href: "/settings/playlists", label: "Playlists" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  if (pathname === "/signin") {
    return null;
  }

  return (
    <header className="pointer-events-none sticky top-4 z-50 px-4 sm:px-6">
      <div className="pointer-events-auto mx-auto flex w-full max-w-5xl items-center gap-2 overflow-x-auto rounded-2xl border border-white/10 bg-[#0d120f]/80 px-4 py-2.5 shadow-lg shadow-black/30 backdrop-blur-md">
        <Link
          className="mr-2 flex shrink-0 items-center gap-2.5 text-xl font-bold tracking-tight text-white"
          href="/"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1ed760]">
            <svg
              aria-hidden
              className="h-4 w-4 fill-[#0d120f]"
              viewBox="0 0 24 24"
            >
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.29 17.34a.747.747 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.04 8.5-.59 11.66 1.34.35.21.46.67.25 1.03zm1.47-3.27a.936.936 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.937.937 0 0 1-.55-1.79c4.37-1.33 9.8-.68 13.5 1.6.44.27.58.85.31 1.28zm.13-3.41C15.05 8.36 8.61 8.15 4.94 9.27a1.125 1.125 0 0 1-.66-2.15c4.22-1.28 11.28-1.03 15.72 1.6a1.125 1.125 0 0 1-1.1 1.94z" />
            </svg>
          </span>
          FixSpotify
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {links.map((link) => {
            const isActive =
              pathname === link.href || pathname.startsWith(`${link.href}/`);

            return (
              <Link
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 transition-colors ${
                  isActive
                    ? "bg-[#1ed760]/15 font-medium text-[#1ed760]"
                    : "text-[#a7b0aa] hover:bg-white/5 hover:text-white"
                }`}
                href={link.href}
                key={link.href}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
