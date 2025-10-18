"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useColumnSetting } from "../lib/columns";
import MasonryColumns, { type MItem } from "../components/MasonryColumns";
import LightboxViewer from "../components/LightboxViewer";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

type Img = {
  id: number;
  path: string;
  name: string;
  size: number;
  mtimeMs: number;
  user: string | null;
  platform: string | null;
  width?: number | null;
  height?: number | null;
};

type Cursor = { cursorMtime: string; cursorId: string } | null;

async function fetchImages(cursor?: Cursor, limit = 60, refresh = false) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor?.cursorMtime) params.set("cursorMtime", cursor.cursorMtime);
  if (cursor?.cursorId) params.set("cursorId", cursor.cursorId);
  if (refresh) params.set("refresh", "1");
  const res = await fetch(`${BASE}/api/images?${params.toString()}`);
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json() as Promise<{ items: Img[]; nextCursor: Cursor; total: number; galleryDir: string }>;
}

export default function Home() {
  const [items, setItems] = useState<Img[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [meta, setMeta] = useState<{ total: number } | null>(null);
  const { cols, setCols, maxWidthPx, columnStyle, colWidth, colGap } = useColumnSetting(3);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const mergeUnique = useCallback((prev: Img[], incoming: Img[]) => {
    if (prev.length === 0) return incoming;
    const map = new Map<number, Img>();
    for (const it of prev) map.set(it.id, it);
    for (const it of incoming) if (!map.has(it.id)) map.set(it.id, it);
    return Array.from(map.values());
  }, []);

  const loadMore = useCallback(
    async (refresh = false) => {
      if (loading || done) return;
      setLoading(true);
      try {
        const data = await fetchImages(refresh ? null : cursor, 60, refresh);
        setItems((prev) => (refresh ? data.items : mergeUnique(prev, data.items)));
        setCursor(data.nextCursor);
        setDone(!data.nextCursor);
        setMeta({ total: data.total });
      } finally {
        setLoading(false);
      }
    },
    [cursor, loading, done]
  );

  useEffect(() => {
    loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  // responsive columns via CSS utility classes

  return (
    <>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-black/60 backdrop-blur text-sm">
        <div className="w-full mx-auto px-4 sm:px-6" style={{ maxWidth: `${maxWidthPx}px` }}>
          <header className="py-3 flex items-center justify-between gap-3 flex-wrap max-w-full">
            <div className="opacity-70 min-w-0 flex-1 truncate">{meta ? `${meta.total} item${meta.total === 1 ? "" : "s"}` : "Loading..."}</div>
            <div className="flex gap-3 items-center flex-none whitespace-nowrap">
              <label className="flex items-center gap-2">
                {/* <span>Cols</span> */}
                <select
                  value={cols}
                  onChange={(e) => setCols(Number(e.target.value))}
                  className="px-2 py-1 rounded border border-neutral-300 dark:border-neutral-700 bg-transparent"
                >
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <Link href="/users" className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700">
                Users
              </Link>
              <button
                className="px-3 py-1.5 rounded bg-neutral-800 text-white"
                onClick={() => {
                  setItems([]);
                  setCursor(null);
                  setDone(false);
                  loadMore(true);
                }}
              >
                {/* Refresh Index */}
                Sync
              </button>
            </div>
          </header>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-screen px-2 sm:px-6 pt-2 sm:pt-6 flex flex-col items-center">
        <div className="w-full mx-auto" style={{ maxWidth: `${maxWidthPx}px` }}>
          <MasonryColumns
            items={items as unknown as MItem[]}
            cols={cols}
            colWidth={colWidth}
            gap={colGap}
            makeHref={(it) => `${BASE}/user/${it.platform}/${it.user}`}
            makeThumbSrc={(it) => `${BASE}/api/fs/${it.path}`}
            onItemClick={(_, idx) => setViewerIndex(idx)}
            renderFooter={(it) => (
              <>
                <span className="truncate">
                  {it.platform}/{it.user}
                </span>
                <span>{it.mtimeMs ? new Date(it.mtimeMs).toLocaleDateString() : ""}</span>
              </>
            )}
          />

          <div ref={sentinelRef} className="h-12 flex items-center justify-center text-neutral-500">
            {done ? "No more" : loading ? "Loading…" : "Scroll to load more"}
          </div>
        </div>
      </div>

      {viewerIndex != null && viewerIndex >= 0 && viewerIndex < items.length ? (
        <LightboxViewer items={items as unknown as MItem[]} index={viewerIndex} onClose={() => setViewerIndex(null)} onNavigate={(i) => setViewerIndex(i)} />
      ) : null}
    </>
  );
}
