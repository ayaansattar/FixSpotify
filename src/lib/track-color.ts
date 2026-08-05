/**
 * Palette helpers for the color-archive track list.
 * Prefer album-cover extraction; fall back to a stable artist/title hash.
 */

export function colorFromKey(key: string): string {
  const seed = key.trim().toLowerCase() || "track";
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  const hue = Math.abs(hash) % 360;
  // Saturated midtones read well behind black active text (Skiper-style).
  const saturation = 68 + (Math.abs(hash >> 8) % 18);
  const lightness = 44 + (Math.abs(hash >> 16) % 10);
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

/** Convert sampled RGB into a vivid HSL background string. */
function vividFromRgb(r: number, g: number, b: number): string {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === rn) {
      hue = ((gn - bn) / delta) % 6;
    } else if (max === gn) {
      hue = (bn - rn) / delta + 2;
    } else {
      hue = (rn - gn) / delta + 4;
    }
    hue = Math.round(hue * 60);
    if (hue < 0) {
      hue += 360;
    }
  }

  const lightness = (max + min) / 2;
  const saturation =
    delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

  // Lift grey/dark album art into a usable field color.
  const satPct = Math.round(Math.min(92, Math.max(55, saturation * 100 + 25)));
  const lightPct = Math.round(Math.min(58, Math.max(38, lightness * 100 + 18)));
  return `hsl(${hue} ${satPct}% ${lightPct}%)`;
}

const albumColorCache = new Map<string, string>();

/**
 * Average a downscaled album cover. Returns null when the CDN blocks canvas
 * reads (CORS) — callers should keep the artist-hash fallback.
 */
export function extractAlbumColor(imageUrl: string): Promise<string | null> {
  const cached = albumColorCache.get(imageUrl);
  if (cached) {
    return Promise.resolve(cached);
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";

    img.onload = () => {
      try {
        const size = 40;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) {
          resolve(null);
          return;
        }

        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        let r = 0;
        let g = 0;
        let b = 0;
        let weight = 0;

        // Skip near-black / near-white pixels so borders don't wash the color.
        for (let i = 0; i < data.length; i += 4) {
          const pr = data[i] ?? 0;
          const pg = data[i + 1] ?? 0;
          const pb = data[i + 2] ?? 0;
          const max = Math.max(pr, pg, pb);
          const min = Math.min(pr, pg, pb);
          if (max < 28 || min > 230) {
            continue;
          }
          const w = 1 + (max - min) / 255;
          r += pr * w;
          g += pg * w;
          b += pb * w;
          weight += w;
        }

        if (weight < 1) {
          resolve(null);
          return;
        }

        const color = vividFromRgb(r / weight, g / weight, b / weight);
        albumColorCache.set(imageUrl, color);
        resolve(color);
      } catch {
        resolve(null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}
