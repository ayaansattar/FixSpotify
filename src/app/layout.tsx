import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Spotify Manager",
  description: "Manage your Spotify listening history and playlists.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
