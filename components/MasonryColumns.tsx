"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export type MItem = {
  id: number;
  path: string;
  name: string;
  width?: number | null;
  height?: number | null;
  platform?: string | null;
  user?: string | null;
  mtimeMs?: number;
  mediaType?: string | null; // "image" | "video" | other
  durationMs?: number | null;
};

type Props = {
  items: MItem[];
  cols: number; // strict number of columns
  colWidth: number; // width per column (px)
  gap: number; // gap between columns/items (px)
  makeHref: (it: MItem) => string;
  makeThumbSrc: (it: MItem, displayWidth: number, displayHeight: number) => string;
  getAnchorProps?: (it: MItem) => Record<string, string>;
  renderFooter?: (it: MItem) => React.ReactNode;
  onItemClick?: (it: MItem, index: number) => void;
};

export default function MasonryColumns({ items, cols, colWidth, gap, makeHref, makeThumbSrc, getAnchorProps, renderFooter, onItemClick }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerW, setContainerW] = useState<number>(0);
  const [viewport, setViewport] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  const overscan = 600; // extra render buffer above/below to reduce jitter when fast scrolling

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setContainerW(el.clientWidth);
    update();
    const ro = new (window as any).ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // listen to scroll and resize; compute viewport range [start, end] relative to the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let ticking = false;
    const calc = () => {
      ticking = false;
      const rect = el.getBoundingClientRect();
      const winH = window.innerHeight || document.documentElement.clientHeight || 0;
      const start = Math.max(0, -rect.top);
      const end = Math.max(0, winH - rect.top);
      setViewport({ start, end });
    };
    const onScrollOrResize = () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(calc);
      }
    };
    calc();
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("scroll", onScrollOrResize as any);
      window.removeEventListener("resize", onScrollOrResize as any);
    };
  }, [containerRef.current]);

  const N = Math.max(1, Math.min(10, Math.floor(cols)));
  const effectiveColWidth = useMemo(() => {
    if (!containerW) return colWidth;
    const w = Math.floor((containerW - (N - 1) * gap) / N);
    return Math.max(80, Math.min(colWidth, w)); // not larger than base colWidth and not smaller than 80
  }, [containerW, N, gap, colWidth]);

  const columns = useMemo(() => {
    const colHeights = new Array(N).fill(0) as number[];
    const colsArr: Array<{
      items: Array<{ it: MItem; w: number; h: number; displayH: number; y: number }>;
      total: number;
    }> = Array.from({ length: N }, () => ({ items: [], total: 0 }));
    const maxHPerItem = Math.round(effectiveColWidth * 2); // clamp height to at most 2x display width
    for (const it of items) {
      const r = it.width && it.height ? it.height / it.width : 1; // height/width ratio
      const h = Math.round(effectiveColWidth * r);
      const displayH = Math.min(h, maxHPerItem);
      // find the shortest column
      let minIdx = 0;
      for (let i = 1; i < N; i++) if (colHeights[i] < colHeights[minIdx]) minIdx = i;
      const y = colHeights[minIdx];
      colsArr[minIdx].items.push({ it, w: effectiveColWidth, h, displayH, y });
      colHeights[minIdx] += displayH + gap;
    }
    for (let i = 0; i < N; i++) {
      // total includes the final gap; keep consistent with building above
      colsArr[i].total = Math.max(0, colHeights[i]);
    }
    return colsArr;
  }, [items, N, effectiveColWidth, gap]);

  return (
    <div ref={containerRef} style={{ display: "flex", gap: `${gap}px`, width: "100%" }}>
      {columns.map((col, i) => {
        const startY = Math.max(0, viewport.start - overscan);
        const endY = Math.max(0, viewport.end + overscan);
        const arr = col.items;
        // linear scan for visible window (XXX: can be optimized with binary search if needed)
        let first = 0;
        while (first < arr.length && arr[first].y + arr[first].displayH < startY) first++;
        let last = arr.length - 1;
        while (last >= 0 && arr[last].y > endY) last--;
        const hasVisible = first <= last && first < arr.length && last >= 0;
        const topSpacer = hasVisible ? arr[first].y : col.total;
        const bottomFrom = hasVisible ? arr[last].y + arr[last].displayH + gap : col.total;
        const bottomSpacer = Math.max(0, col.total - bottomFrom);
        return (
          <div key={i} style={{ width: `${effectiveColWidth}px` }}>
            {topSpacer > 0 ? <div style={{ height: `${topSpacer}px` }} /> : null}
            {hasVisible
              ? arr.slice(first, last + 1).map(({ it, w, displayH }) => {
                  const cardInner = (
                    <div
                      style={{
                        width: `${w}px`,
                        height: `${displayH}px`,
                        borderRadius: 4,
                        overflow: "hidden",
                        background: "#111",
                        position: "relative",
                        fontSize: 12,
                      }}
                    >
                      {it.mediaType === "video" ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`${BASE}/api/vthumb/${it.path}`}
                          alt={it.name}
                          width={w}
                          height={displayH}
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={makeThumbSrc(it, w, displayH)}
                          alt={it.name}
                          width={w}
                          height={displayH}
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                        />
                      )}
                      {it.mediaType === "video" ? (
                        <div
                          style={{
                            position: "absolute",
                            right: 6,
                            bottom: 6,
                            background: "rgba(0,0,0,0.6)",
                            color: "#fff",
                            borderRadius: 6,
                            padding: "4px 8px",
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <span aria-hidden="true">▶</span>
                          <span>{formatDuration(it.durationMs)}</span>
                        </div>
                      ) : null}
                    </div>
                  );

                  if (onItemClick) {
                    // interaction split: image opens viewer; footer is a navigation link
                    return (
                      <div
                        key={it.id}
                        className="group block"
                        style={{ width: `${w}px`, marginBottom: `${gap}px` }}
                        {...(getAnchorProps ? getAnchorProps(it) : {})}
                      >
                        <div
                          onClick={() => {
                            const idx = items.findIndex((x) => x.id === it.id);
                            onItemClick(it, idx >= 0 ? idx : 0);
                          }}
                        >
                          {cardInner}
                        </div>
                        {renderFooter ? (
                          <a href={makeHref(it)} className="mt-1 text-xs text-neutral-500 flex items-center justify-between">
                            {renderFooter(it)}
                          </a>
                        ) : null}
                      </div>
                    );
                  }

                  return (
                    <a
                      key={it.id}
                      href={makeHref(it)}
                      className="group block"
                      style={{ width: `${w}px`, marginBottom: `${gap}px` }}
                      {...(getAnchorProps ? getAnchorProps(it) : {})}
                    >
                      {cardInner}
                      {renderFooter ? <div className="mt-1 text-xs text-neutral-500 flex items-center justify-between">{renderFooter(it)}</div> : null}
                    </a>
                  );
                })
              : null}
            {bottomSpacer > 0 ? <div style={{ height: `${bottomSpacer}px` }} /> : null}
          </div>
        );
      })}
    </div>
  );
}

// chatgpt made this; didn't want to calculate numbers myself
// i'm Csian
function formatDuration(ms?: number | null) {
  if (!ms || ms <= 0 || !isFinite(ms)) return "";
  const total = Math.round(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}
