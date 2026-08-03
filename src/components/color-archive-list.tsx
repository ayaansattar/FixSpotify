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
  /** Fired when the focused song changes. */
  onActiveChange?: (item: ColorArchiveItem | null, index: number) => void;
};

const PREVIEW_SIZE = 280;

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
  onActiveChange,
}: ColorArchiveListProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
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

  const activeItem = items[activeIndex] ?? null;
  const activeImageUrl =
    upgradeAlbumImageUrl(activeItem?.imageUrl) ?? activeItem?.imageUrl ?? null;
  const background =
    (activeItem && colors.get(activeItem.id)) ||
    (items[0] ? colors.get(items[0].id) : null) ||
    "hsl(150 30% 18%)";

  // Paint the whole viewport, not a contained card.
  useEffect(() => {
    const { body, documentElement } = document;
    documentElement.style.setProperty("--archive-bg", background);
    body.classList.add("archive-fullscreen");

    return () => {
      documentElement.style.removeProperty("--archive-bg");
      body.classList.remove("archive-fullscreen");
    };
  }, [background]);

  const updateActiveFromScroll = useCallback(() => {
    if (items.length === 0) {
      return;
    }

    const focusY = window.innerHeight * 0.4;
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < rowRefs.current.length; i += 1) {
      const row = rowRefs.current[i];
      if (!row) {
        continue;
      }
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const distance = Math.abs(mid - focusY);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }

    setActiveIndex((current) => (current === bestIndex ? current : bestIndex));
  }, [items.length]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, items.length);
    setActiveIndex(0);
    setPreviewOffset({ x: 0, y: 0 });
    const frame = requestAnimationFrame(updateActiveFromScroll);
    return () => cancelAnimationFrame(frame);
  }, [items, updateActiveFromScroll]);

  useEffect(() => {
    onActiveChange?.(activeItem, activeIndex);
  }, [activeItem, activeIndex, onActiveChange]);

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
    setActiveIndex(index);
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

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`color-archive relative mt-8 ${className}`}>
      {activeImageUrl ? (
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
            transform: `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0)`,
          }}
        >
          {/* Spotify CDN URLs; plain img avoids next/image remote-pattern config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="h-full w-full rounded-2xl object-cover shadow-2xl shadow-black/35 ring-1 ring-black/10"
            draggable={false}
            height={640}
            key={activeImageUrl}
            src={activeImageUrl}
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
          const isActive = index === activeIndex;
          const distance = Math.abs(index - activeIndex);
          const opacity =
            distance === 0 ? 1 : distance === 1 ? 0.42 : distance === 2 ? 0.24 : 0.14;

          return (
            <li
              className="border-b border-black/10 last:border-b-0"
              key={`${item.id}-${index}`}
              ref={(node) => {
                rowRefs.current[index] = node;
              }}
            >
              <div
                className="flex w-full max-w-[min(100%,36rem)] cursor-pointer flex-col gap-1 py-5 text-left transition-[opacity,transform] duration-300 sm:max-w-[min(100%,40rem)]"
                onClick={() => focusRow(index)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    focusRow(index);
                  }
                }}
                role="button"
                style={{
                  opacity,
                  transform: isActive ? "scale(1)" : "scale(0.985)",
                  color: isActive ? "#0a0a0a" : "rgb(0 0 0 / 55%)",
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
                      isActive ? "text-black/70" : "text-black/45"
                    }`}
                  >
                    {item.subtitle}
                  </span>
                ) : null}
                {item.badge ? (
                  <span
                    className={`mt-1 w-fit rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${
                      isActive
                        ? "bg-black/10 text-black"
                        : "bg-black/5 text-black/55"
                    }`}
                  >
                    {item.badge}
                  </span>
                ) : null}
              </div>

              {isActive && renderActivePanel ? (
                <div className="max-w-[min(100%,36rem)] pb-5 text-black/80 sm:max-w-[min(100%,40rem)]">
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
