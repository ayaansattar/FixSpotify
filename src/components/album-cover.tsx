type AlbumCoverProps = {
  url?: string | null;
  size?: number;
};

/** Decorative album art thumb for track rows. Adjacent text carries the name. */
export function AlbumCover({ url, size = 40 }: AlbumCoverProps) {
  return (
    <div
      aria-hidden
      className="shrink-0 overflow-hidden rounded bg-white/10"
      style={{ width: size, height: size }}
    >
      {url ? (
        // Spotify CDN URLs; plain img avoids next/image remote-pattern config.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="h-full w-full object-cover"
          height={size}
          loading="lazy"
          src={url}
          width={size}
        />
      ) : (
        <div className="h-full w-full bg-white/[0.04]" />
      )}
    </div>
  );
}
