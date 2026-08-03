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

export type ColorArchiveItem = {
  id: string;
  title: string;
  badge: string;
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

const PREVIEW_SIZE = 220;

/**
 * Skiper-inspired finite color archive: scroll focuses one song, the page
 * color shifts to that track's album/artist palette, and a draggable album
 * cover floats as the preview. Does not loop past the last track.
 */
export function ColorArchiveList({
  items,
  className = "",
  renderActivePanel,
  onActiveChange,
}: ColorArchiveListProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
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
        imageUrl: item.imageUrl,
      })),
    [items],
  );
  const colors = useTrackColors(colorSources);

  const activeItem = items[activeIndex] ?? null;
  const background =
    (activeItem && colors.get(activeItem.id)) ||
    (items[0] ? colors.get(items[0].id) : null) ||
    "hsl(150 30% 18%)";

  const updateActiveFromScroll = useCallback(() => {
    const root = scrollerRef.current;
    if (!root || items.length === 0) {
      return;
    }

    const focusY = root.getBoundingClientRect().top + root.clientHeight * 0.38;
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
    const root = scrollerRef.current;
    if (!root) {
      return;
    }

    const onScroll = () => updateActiveFromScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateActiveFromScroll();

    return () => {
      root.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateActiveFromScroll]);

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
    <div
      className={`color-archive relative isolate mt-5 overflow-hidden rounded-3xl ${className}`}
      style={{
        backgroundColor: background,
        transition: "background-color 420ms ease",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(circle at 80% 20%, rgb(255 255 255 / 28%), transparent 42%)",
        }}
      />

      {activeItem?.imageUrl ? (
        <div
          aria-hidden
          className="absolute right-[6%] top-[12%] z-20 cursor-grab touch-none active:cursor-grabbing sm:right-[8%] sm:top-[18%]"
          onPointerDown={onPreviewPointerDown}
          onPointerMove={onPreviewPointerMove}
          onPointerUp={onPreviewPointerUp}
          onPointerCancel={onPreviewPointerUp}
          style={{
            width: PREVIEW_SIZE,
            height: PREVIEW_SIZE,
            maxWidth: "42vw",
            maxHeight: "42vw",
            transform: `translate3d(${previewOffset.x}px, ${previewOffset.y}px, 0)`,
            pointerEvents: "auto",
          }}
        >
          {/* Spotify CDN URLs; plain img avoids next/image remote-pattern config. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            className="h-full w-full rounded-2xl object-cover shadow-2xl shadow-black/35 ring-1 ring-black/10"
            draggable={false}
            height={PREVIEW_SIZE}
            key={activeItem.imageUrl}
            src={activeItem.imageUrl}
            width={PREVIEW_SIZE}
          />
        </div>
      ) : null}

      <div
        className="relative z-10 max-h-[min(70vh,40rem)] overflow-y-auto overscroll-contain py-[18vh]"
        ref={scrollerRef}
      >
        <ol className="mx-auto w-full max-w-3xl px-6 sm:px-10">
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
                  className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left transition-[opacity,transform] duration-300"
                  onClick={() => {
                    rowRefs.current[index]?.scrollIntoView({
                      behavior: "smooth",
                      block: "center",
                    });
                    setActiveIndex(index);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      rowRefs.current[index]?.scrollIntoView({
                        behavior: "smooth",
                        block: "center",
                      });
                      setActiveIndex(index);
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
                    className={`min-w-0 flex-1 truncate text-2xl font-medium tracking-tight sm:text-3xl ${
                      isActive ? "font-semibold" : ""
                    }`}
                  >
                    {item.title}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold sm:text-sm ${
                      isActive
                        ? "bg-black/10 text-black"
                        : "bg-black/5 text-black/55"
                    }`}
                  >
                    {item.badge}
                  </span>
                </div>

                {isActive && renderActivePanel ? (
                  <div className="pb-5 text-black/80">
                    {renderActivePanel(item, index)}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
