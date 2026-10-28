"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { useTrackColors } from "@/hooks/use-track-colors";
import {
  thumbnailAlbumImageUrl,
  upgradeAlbumImageUrl,
} from "@/lib/spotify";

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

type RenderActivePanel = (item: ColorArchiveItem, index: number) => ReactNode;

type ColorArchiveListProps = {
  items: ColorArchiveItem[];
  className?: string;
  /** Extra content under the focused row (actions, notes, etc.). */
  renderActivePanel?: RenderActivePanel;
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
/** Rows either side of the focused one whose colors are resolved. */
const COLOR_WINDOW = 6;
/** Rows either side of the focused one whose full-size covers are prefetched. */
const PRELOAD_WINDOW = 3;

/** Full-size cover URLs already requested this session. */
const preloadedCovers = new Set<string>();

type ArchiveState = {
  activeIndex: number | null;
  onColoredBg: boolean;
  renderPanel: RenderActivePanel | null;
};

type ArchiveStore = ReturnType<typeof createArchiveStore>;

/**
 * Focus state lives outside React state so a focus change doesn't re-render
 * the whole list (1000+ rows on big playlists). Each row subscribes and only
 * re-renders when its own derived value (distance, panel) changes.
 */
function createArchiveStore() {
  let state: ArchiveState = {
    activeIndex: null,
    onColoredBg: false,
    renderPanel: null,
  };
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set(patch: Partial<ArchiveState>) {
      const next = { ...state, ...patch };
      if (
        next.activeIndex === state.activeIndex &&
        next.onColoredBg === state.onColoredBg &&
        next.renderPanel === state.renderPanel
      ) {
        return;
      }
      state = next;
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function useArchiveState<T>(
  store: ArchiveStore,
  select: (state: ArchiveState) => T,
) {
  const getSnapshot = () => select(store.get());
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}

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
  const [store] = useState(createArchiveStore);
  /** Title rows only — exclude the expanding action panel from focus math. */
  const rowRefs = useRef<Array<HTMLElement | null>>([]);
  const activeIdRef = useRef<string | null>(null);

  // Parents usually pass an inline renderer; route it through the store so
  // only the focused row re-renders when it changes.
  useLayoutEffect(() => {
    store.set({ renderPanel: renderActivePanel ?? null });
  }, [store, renderActivePanel]);

  const commitActiveIndex = useCallback(
    (next: number | null) => {
      activeIdRef.current = next === null ? null : (items[next]?.id ?? null);
      store.set({ activeIndex: next });
    },
    [items, store],
  );

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

    // Rows are in document order, so their midpoints only increase: binary
    // search the first one at/after the band, then walk until past it. Keeps
    // layout reads to O(log n) per scroll frame on large playlists.
    const rowCount = rowRefs.current.length;
    let low = 0;
    let high = rowCount;
    while (low < high) {
      const middle = (low + high) >> 1;
      const mid = midFor(middle);
      if (mid !== null && mid < enterTop) {
        low = middle + 1;
      } else {
        high = middle;
      }
    }

    for (let i = low; i < rowCount; i += 1) {
      const mid = midFor(i);
      if (mid === null) {
        continue;
      }
      if (mid > enterBottom) {
        break;
      }
      const distance = Math.abs(mid - focusY);
      if (distance < bestEnterDistance) {
        bestEnterDistance = distance;
        bestEnterIndex = i;
      }
    }

    const current = store.get().activeIndex;
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
  }, [commitActiveIndex, items.length, store]);

  useEffect(() => {
    rowRefs.current = rowRefs.current.slice(0, items.length);

    const previousId = activeIdRef.current;
    const previousIndex = store.get().activeIndex;
    let nextIndex: number | null = null;

    if (previousId) {
      const byId = items.findIndex((item) => item.id === previousId);
      if (byId >= 0) {
        // Same track still present (filters / reorder).
        nextIndex = byId;
      } else if (previousIndex !== null && items.length > 0) {
        // Focused track was removed — the song that slid into its slot.
        nextIndex = Math.min(previousIndex, items.length - 1);
      }
    }

    commitActiveIndex(nextIndex);

    let cancelled = false;
    const remasure = () => {
      if (!cancelled) {
        updateActiveFromScroll();
      }
    };

    // List height changes when the action panel collapses; remeasure after
    // layout settles so the cover attaches to the newly visible song.
    remasure();
    let frame2 = 0;
    const frame1 = requestAnimationFrame(() => {
      remasure();
      frame2 = requestAnimationFrame(remasure);
    });
    const timeout = window.setTimeout(remasure, 80);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame1);
      cancelAnimationFrame(frame2);
      window.clearTimeout(timeout);
    };
  }, [items, commitActiveIndex, updateActiveFromScroll, store]);

  useEffect(() => {
    // Scroll fires many times per frame; measure at most once per frame.
    let frame = 0;
    const onScroll = () => {
      if (frame) {
        return;
      }
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateActiveFromScroll();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    updateActiveFromScroll();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateActiveFromScroll]);

  const focusRow = useCallback((index: number) => {
    rowRefs.current[index]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, []);

  const registerRow = useCallback(
    (index: number, node: HTMLElement | null) => {
      rowRefs.current[index] = node;
    },
    [],
  );

  // Built only when the items change — not on focus moves or parent renders.
  const rows = useMemo(
    () =>
      items.map((item, index) => (
        <ArchiveRow
          index={index}
          item={item}
          key={`${item.id}-${index}`}
          onFocus={focusRow}
          registerRow={registerRow}
          store={store}
        />
      )),
    [items, focusRow, registerRow, store],
  );

  if (items.length === 0) {
    return null;
  }

  return (
    <div className={`color-archive relative mt-8 ${className}`}>
      <ArchiveChrome items={items} store={store} />

      {/* Extra bottom space so the last songs can scroll into the focus band. */}
      <ol className="relative z-10 mx-auto w-full max-w-3xl pb-[55vh] pt-[12vh]">
        {rows}
      </ol>
    </div>
  );
}

/**
 * Everything that follows the focused song — viewport color, cover preview,
 * prefetching — kept in its own component so focus changes re-render this
 * instead of the list.
 */
function ArchiveChrome({
  items,
  store,
}: {
  items: ColorArchiveItem[];
  store: ArchiveStore;
}) {
  const activeIndex = useArchiveState(store, (state) => state.activeIndex);
  const [preview, setPreview] = useState<{
    full: string;
    thumb: string | null;
  } | null>(null);
  /** Full-size covers that have finished decoding (shown over the thumbnail). */
  const [loadedCovers, setLoadedCovers] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewOffset, setPreviewOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Only the focused song's color is ever shown, so resolve colors for the
  // rows around it instead of every cover in a large playlist.
  const colorWindowStart = Math.max(0, (activeIndex ?? 0) - COLOR_WINDOW);
  const colorWindowEnd = (activeIndex ?? 0) + COLOR_WINDOW + 1;
  const colorSources = useMemo(
    () =>
      items.slice(colorWindowStart, colorWindowEnd).map((item) => ({
        id: item.id,
        colorKey: item.colorKey,
        // The color is a 40px average; the 64px thumb avoids a 640px download per track.
        imageUrl: thumbnailAlbumImageUrl(item.imageUrl) ?? item.imageUrl,
      })),
    [items, colorWindowStart, colorWindowEnd],
  );
  const colors = useTrackColors(colorSources);

  const activeItem =
    activeIndex === null ? null : (items[activeIndex] ?? null);
  const activeImageUrl =
    upgradeAlbumImageUrl(activeItem?.imageUrl) ?? activeItem?.imageUrl ?? null;
  const activeThumbUrl =
    thumbnailAlbumImageUrl(activeItem?.imageUrl) ?? activeItem?.imageUrl ?? null;
  const background = activeItem ? colors.get(activeItem.id) ?? null : null;

  useEffect(() => {
    store.set({ onColoredBg: Boolean(background) });
  }, [store, background]);

  // Full-viewport wash only while a song is in the focus band; otherwise
  // restore the normal site background. Set inline on html/body rather than
  // via an inherited custom property on :root, which forces a style recalc
  // of every element in the list each time focus moves.
  useEffect(() => {
    const { body, documentElement } = document;

    if (background) {
      documentElement.style.backgroundColor = background;
      body.style.background = background;
    } else {
      documentElement.style.removeProperty("background-color");
      body.style.removeProperty("background");
    }

    return () => {
      documentElement.style.removeProperty("background-color");
      body.style.removeProperty("background");
    };
  }, [background]);

  // Warm the browser cache with the full-size covers just above and below the
  // focused row, so the preview is ready by the time scrolling reaches them.
  useEffect(() => {
    if (activeIndex === null) {
      return;
    }

    const start = Math.max(0, activeIndex - PRELOAD_WINDOW);
    const end = Math.min(items.length, activeIndex + PRELOAD_WINDOW + 1);
    for (let i = start; i < end; i += 1) {
      const url = upgradeAlbumImageUrl(items[i]?.imageUrl);
      if (url && !preloadedCovers.has(url)) {
        preloadedCovers.add(url);
        const img = new Image();
        img.decoding = "async";
        img.src = url;
      }
    }
  }, [activeIndex, items]);

  // A new list (filter, search, removal) recenters the dragged cover.
  useEffect(() => {
    setPreviewOffset({ x: 0, y: 0 });
  }, [items]);

  // Soft fade the cover so enter/leave doesn't pop or thrash the image.
  useEffect(() => {
    if (activeImageUrl) {
      setPreview({ full: activeImageUrl, thumb: activeThumbUrl });
      const frame = requestAnimationFrame(() => setPreviewVisible(true));
      return () => cancelAnimationFrame(frame);
    }

    setPreviewVisible(false);
    const timeout = window.setTimeout(() => {
      setPreview(null);
      setPreviewOffset({ x: 0, y: 0 });
    }, PREVIEW_FADE_MS);
    return () => window.clearTimeout(timeout);
  }, [activeImageUrl, activeThumbUrl]);

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

  if (!preview) {
    return null;
  }

  return (
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
      {/* Spotify CDN URLs; plain img avoids next/image remote-pattern config.
          The thumbnail is already cached from color sampling, so it shows
          the right cover instantly; the full-size image fades in over it
          once loaded. Keyed by URL so a stale cover never lingers. */}
      {preview.thumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className="absolute inset-0 h-full w-full rounded-2xl object-cover shadow-2xl shadow-black/35 ring-1 ring-black/10"
          draggable={false}
          height={64}
          key={preview.thumb}
          src={preview.thumb}
          width={64}
        />
      ) : null}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="absolute inset-0 h-full w-full rounded-2xl object-cover shadow-2xl shadow-black/35 ring-1 ring-black/10"
        draggable={false}
        height={640}
        key={preview.full}
        onLoad={() => {
          const url = preview.full;
          setLoadedCovers((current) =>
            current.has(url) ? current : new Set(current).add(url),
          );
        }}
        src={preview.full}
        style={{
          opacity: loadedCovers.has(preview.full) ? 1 : 0,
          transition: `opacity ${PREVIEW_FADE_MS}ms ease`,
        }}
        width={640}
      />
    </div>
  );
}

type ArchiveRowProps = {
  item: ColorArchiveItem;
  index: number;
  store: ArchiveStore;
  onFocus: (index: number) => void;
  registerRow: (index: number, node: HTMLElement | null) => void;
};

const ArchiveRow = memo(function ArchiveRow({
  item,
  index,
  store,
  onFocus,
  registerRow,
}: ArchiveRowProps) {
  // Rows 3+ away share one opacity, so cap the distance: moving focus only
  // re-renders the handful of rows near it. -1 means nothing is focused.
  const distance = useArchiveState(store, ({ activeIndex }) =>
    activeIndex === null ? -1 : Math.min(Math.abs(index - activeIndex), 3),
  );
  const onColoredBg = useArchiveState(store, (state) => state.onColoredBg);
  const renderPanel = useArchiveState(store, (state) =>
    state.activeIndex === index ? state.renderPanel : null,
  );
  const isActive = distance === 0;
  const panel = isActive && renderPanel ? renderPanel(item, index) : null;
  const opacity =
    distance === -1
      ? 0.55
      : distance === 0
        ? 1
        : distance === 1
          ? 0.42
          : distance === 2
            ? 0.24
            : 0.14;
  const setRef = useCallback(
    (node: HTMLElement | null) => registerRow(index, node),
    [index, registerRow],
  );

  return (
    <li
      className={`border-b last:border-b-0 ${
        onColoredBg ? "border-black/10" : "border-white/10"
      }`}
      // Let the browser skip style/layout/paint for off-screen rows; "auto"
      // remembers each row's real height once it has been rendered.
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 141px",
      }}
    >
      <div
        className="flex w-full max-w-[min(100%,36rem)] cursor-pointer flex-col gap-1 py-5 text-left transition-[opacity,transform,color] duration-300 sm:max-w-[min(100%,40rem)]"
        onClick={() => onFocus(index)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onFocus(index);
          }
        }}
        ref={setRef}
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

      {panel ? (
        <div
          className={`max-w-[min(100%,36rem)] pb-5 sm:max-w-[min(100%,40rem)] ${
            onColoredBg ? "text-black/80" : "text-white/80"
          }`}
        >
          {panel}
        </div>
      ) : null}
    </li>
  );
});
