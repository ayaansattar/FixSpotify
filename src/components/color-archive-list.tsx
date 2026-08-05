"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useTrackColors } from "@/hooks/use-track-colors";
import { upgradeAlbumImageUrl } from "@/lib/spotify";

export type ColorArchiveItem = {
  id: string;
  title: string;
  /** Secondary line under the title (artist name, etc.). */
  subtitle?: string;
  /** Optional short pill (status, position). Kept left of the preview. */
  badge?: string;
  imageUrl?: string | null;
  /** Seed for fallback palette (artist name recommended). */
  colorKey: string;
};

type ColorArchiveListProps = {
  items: ColorArchiveItem[];
  className?: string;
  /** Extra content under the focused row (actions, notes, etc.). */
  renderActivePanel?: (item: ColorArchiveItem, index: number) => ReactNode;
};

const PREVIEW_SIZE = 280;
/** Tighter band to *acquire* focus / show the cover. */
const ENTER_TOP = 0.24;
const ENTER_BOTTOM = 0.66;
/**
 * Slightly wider band to *keep* the current song (stops edge flicker),
 * but not so wide that a barely-visible last song still owns the cover.
 */
const EXIT_TOP = 0.2;
const EXIT_BOTTOM = 0.72;
/** px — another song must be this much closer to steal focus. */
const SWITCH_MARGIN_PX = 48;
const PREVIEW_FADE_MS = 180;

/**
 * Skiper-inspired finite color archive: window scroll focuses one song, the
 * full viewport color shifts to that track's album/artist palette, and a
 * draggable album cover floats as the preview. Does not loop past the last
 * track.
 */
export function ColorArchiveList({
  items,
  className = "",
  renderActivePanel,
}: ColorArchiveListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  /** Title rows only — exclude the expanding action panel from focus math. */
  const rowRefs = useRef<Array<HTMLElement | null>>([]);
  const activeIndexRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const colorSources = useMemo(
    () =>
      items.map((item) => ({
        id: item.id,
        colorKey: item.colorKey,
        imageUrl: upgradeAlbumImageUrl(item.imageUrl) ?? item.imageUrl,
      })),
    [items],
  );
  const colors = useTrackColors(colorSources);

  const activeItem =
    activeIndex === null ? null : (items[activeIndex] ?? null);
  const activeImageUrl =
    upgradeAlbumImageUrl(activeItem?.imageUrl) ?? activeItem?.imageUrl ?? null;
  const background = activeItem ? colors.get(activeItem.id) ?? null : null;

  // Full-viewport wash only while a song is in the focus band; otherwise
  // restore the normal site background.
  useEffect(() => {
    const { body, documentElement } = document;

    if (background) {
      documentElement.style.setProperty("--archive-bg", background);
      body.classList.add("archive-fullscreen");
    } else {
      documentElement.style.removeProperty("--archive-bg");
      body.classList.remove("archive-fullscreen");
    }

    return () => {
      documentElement.style.removeProperty("--archive-bg");
      body.classList.remove("archive-fullscreen");
    };
  }, [background]);

  // Soft fade the cover so enter/leave doesn't pop or thrash the image.
  useEffect(() => {
    if (activeImageUrl) {
      setPreviewUrl(activeImageUrl);
      const frame = requestAnimationFrame(() => setPreviewVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    setPreviewVisible(false);
    const timeout = window.setTimeout(() => {
      setPreviewUrl(null);
      setPreviewOffset({ x: 0, y: 0 });
    }, PREVIEW_FADE_MS);
    return () => window.clearTimeout(timeout);
  }, [activeImageUrl]);

  const commitActiveIndex = useCallback((next: number | null) => {
    if (activeIndexRef.current === next) {
      return;
    }
    activeIndexRef.current = next;
    setActiveIndex(next);
  }, []);

  const updateActiveFromScroll = useCallback(() => {
    if (items.length === 0) {
      commitActiveIndex(null);
      return;
    }

    const viewport = window.innerHeight;
    const enterTop = viewport * ENTER_TOP;
    const enterBottom = viewport * ENTER_BOTTOM;
    const exitTop = viewport * EXIT_TOP;
    const exitBottom = viewport * EXIT_BOTTOM;
    const focusY = (enterTop + enterBottom) / 2;

    const midFor = (index: number) => {
      const row = rowRefs.current[index];
      if (!row) {
        return null;
      }
      const rect = row.getBoundingClientRect();
      return rect.top + rect.height / 2;
    };

    let bestEnterIndex: number | null = null;
    let bestEnterDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < rowRefs.current.length; i += 1) {
      const mid = midFor(i);
      if (mid === null || mid < enterTop || mid > enterBottom) {
        continue;
      }
      const distance = Math.abs(mid - focusY);
      if (distance < bestEnterDistance) {
        bestEnterDistance = distance;
        bestEnterIndex = i;
      }
    }

    const current = activeIndexRef.current;
    if (current !== null) {
      const currentMid = midFor(current);
      const currentRow = rowRefs.current[current];
      const currentRect = currentRow?.getBoundingClientRect() ?? null;

      // Release once the title has mostly left the focus zone (common when
      // scrolling into the bottom padding past the last song).
      const mostlyAboveFocus =
        currentRect !== null && currentRect.bottom < enterTop;
      const stillHeld =
        !mostlyAboveFocus &&
        currentMid !== null &&
        currentMid >= exitTop &&
        currentMid <= exitBottom;

      if (stillHeld) {
        if (
          bestEnterIndex === null ||
          bestEnterIndex === current ||
          Math.abs((currentMid ?? focusY) - focusY) <=
            bestEnterDistance + SWITCH_MARGIN_PX
        ) {
          commitActiveIndex(current);
          return;
        }
      }
    }

    commitActiveIndex(bestEnterIndex);
  }, [commitActiveIndex, items.length]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, items.length);
    activeIndexRef.current = null;
    setActiveIndex(null);
    setPreviewVisible(false);
    setPreviewUrl(null);
    setPreviewOffset({ x: 0, y: 0 });
    const frame = requestAnimationFrame(updateActiveFromScroll);
    return () => cancelAnimationFrame(frame);
  }, [items, updateActiveFromScroll]);

  useEffect(() => {
    const onScroll = () => updateActiveFromScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateActiveFromScroll();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateActiveFromScroll]);

  function focusRow(index: number) {
    rowRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }

  function onPreviewPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: previewOffset.x,
      originY: previewOffset.y,
    };
  }

  function onPreviewPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setPreviewOffset({
      x: drag.originX + (event.clientX - drag.startX),
      y: drag.originY + (event.clientY - drag.startY),
    });
  }

  function onPreviewPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  }

  const onColoredBg = Boolean(background);

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`color-archive relative mt-8 ${className}`}>
      {previewUrl ? (
        <div
          aria-hidden
          className="fixed bottom-[12%] right-[6%] z-30 cursor-grab touch-none active:cursor-grabbing sm:bottom-[14%] sm:right-[8%]"
          onPointerDown={onPreviewPointerDown}
          onPointerMove={onPreviewPointerMove}
          onPointerUp={onPreviewPointerUp}
          onPointerCancel={onPreviewPointerUp}
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            maxWidth: "min(280px, 46vw)",
            maxHeight: "min(280px, 46vw)",
            opacity: previewVisible ? 1 : 0,
            transform: `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0)`,
            transition: `opacity ${PREVIEW_FADE_MS}ms ease`,
            pointerEvents: previewVisible ? "auto" : "none",
          }}
        >
          {/* Spotify CDN URLs; plain img avoids next/image remote-pattern config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="h-full w-full rounded-2xl object-cover shadow-2xl shadow-black/35 ring-1 ring-black/10"
            draggable={false}
            height={640}
            src={previewUrl}
            width={640}
          />
        </div>
      ) : null}

      {/* Extra bottom space so the last songs can scroll into the focus band. */}
      <ol
        className="relative z-10 mx-auto w-full max-w-3xl pb-[55vh] pt-[12vh]"
        ref={listRef}
      >
        {items.map((item, index) => {
          const isActive = activeIndex !== null && index === activeIndex;
          const distance =
            activeIndex === null ? 2 : Math.abs(index - activeIndex);
          const opacity =
            activeIndex === null
              ? 0.55
              : distance === 0
                ? 1
                : distance === 1
                  ? 0.42
                  : distance === 2
                    ? 0.24
                    : 0.14;

          return (
            <li
              className={`border-b last:border-b-0 ${
                onColoredBg ? "border-black/10" : "border-white/10"
              }`}
              key={`${item.id}-${index}`}
            >
              <div
                className="flex w-full max-w-[min(100%,36rem)] cursor-pointer flex-col gap-1 py-5 text-left transition-[opacity,transform,color] duration-300 sm:max-w-[min(100%,40rem)]"
                onClick={() => focusRow(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    focusRow(index);
                  }
                }}
                ref={(node) => {
                  rowRefs.current[index] = node;
                }}
                role="button"
                style={{
                  opacity,
                  transform: isActive ? "scale(1)" : "scale(0.985)",
                  color: onColoredBg
                    ? isActive
                      ? "#0a0a0a"
                      : "rgb(0 0 0 / 55%)"
                    : isActive
                      ? "#f4f7f5"
                      : "rgb(244 247 245 / 55%)",
                }}
                tabIndex={0}
              >
                <span
                  className={`truncate text-2xl font-medium tracking-tight sm:text-3xl ${
                    isActive ? "font-semibold" : ""
                  }`}
                >
                  {item.title}
                </span>
                {item.subtitle ? (
                  <span
                    className={`truncate text-sm sm:text-base ${
                      onColoredBg
                        ? isActive
                          ? "text-black/70"
                          : "text-black/45"
                        : isActive
                          ? "text-white/70"
                          : "text-white/45"
                    }`}
                  >
                    {item.subtitle}
                  </span>
                ) : null}
                {item.badge ? (
                  <span
                    className={`mt-1 w-fit rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${
                      onColoredBg
                        ? isActive
                          ? "bg-black/10 text-black"
                          : "bg-black/5 text-black/55"
                        : isActive
                          ? "bg-white/10 text-white"
                          : "bg-white/5 text-white/55"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </div>

              {isActive && renderActivePanel ? (
                <div
                  className={`max-w-[min(100%,36rem)] pb-5 sm:max-w-[min(100%,40rem)] ${
                    onColoredBg ? "text-black/80" : "text-white/80"
                  }`}
                >
                  {renderActivePanel(item, index)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
