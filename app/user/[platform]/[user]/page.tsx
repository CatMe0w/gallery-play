"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useColumnSetting } from "../../../../lib/columns";
import MasonryColumns, { type MItem } from "../../../../components/MasonryColumns";
import LightboxViewer from "../../../../components/LightboxViewer";

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

async function fetchImages(platform: string, user: string, cursor?: Cursor, limit = 60) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("platform", platform);
  params.set("user", user);
  if (cursor?.cursorMtime) params.set("cursorMtime", cursor.cursorMtime);
  if (cursor?.cursorId) params.set("cursorId", cursor.cursorId);
  const res = await fetch(`${BASE}/api/images?${params.toString()}`);
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json() as Promise<{ items: Img[]; nextCursor: Cursor; total: number; galleryDir: string }>;
}

export default function UserView({ params }: { params: Promise<{ platform: string; user: string }> }) {
  const [route, setRoute] = useState<{ platform: string; user: string } | null>(null);
  useEffect(() => {
    (async () => {
      const p = await params;
      setRoute({ platform: p.platform, user: p.user });
    })();
  }, [params]);

  const [items, setItems] = useState<Img[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { cols, setCols, columnStyle, maxWidthPx, colWidth, colGap } = useColumnSetting(3);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const mergeUnique = useCallback((prev: Img[], incoming: Img[]) => {
    if (prev.length === 0) return incoming;
    const map = new Map<number, Img>();
    for (const it of prev) map.set(it.id, it);
    for (const it of incoming) if (!map.has(it.id)) map.set(it.id, it);
    return Array.from(map.values());
  }, []);

  const loadMore = useCallback(async () => {
    if (!route || loading || done) return;
    setLoading(true);
    try {
      const data = await fetchImages(route.platform, route.user, cursor, 60);
      setItems((prev) => mergeUnique(prev, data.items));
      setCursor(data.nextCursor);
      setDone(!data.nextCursor);
    } finally {
      setLoading(false);
    }
  }, [route, loading, done, cursor]);

  useEffect(() => {
    setItems([]);
    setCursor(null);
    setDone(false);
  }, [route?.platform, route?.user]);

  useEffect(() => {
    if (!route) return;
    loadMore();
  }, [route]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (first.isIntersecting) loadMore();
      },
      { rootMargin: "1200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [loadMore]);

  if (!route) return null;

  return (
    <>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-black/60 backdrop-blur text-sm">
        <div className="w-full mx-auto px-4 sm:px-6" style={{ maxWidth: `${maxWidthPx}px` }}>
          <header className="py-3 flex items-center justify-between gap-3 flex-wrap max-w-full">
            <div className="opacity-70 min-w-0 flex-1 truncate">
              {route.platform}/{route.user}
            </div>
            <div className="flex items-center gap-3 flex-none whitespace-nowrap">
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
              <Link className="px-3 py-1.5 rounded border border-neutral-300 dark:border-neutral-700" href="/">
                Home
              </Link>
            </div>
          </header>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-screen px-2 sm:px-6 pt-2 sm:pt-6 flex flex-col items-center">
        <div className="w-full mx-auto" style={{ maxWidth: `${maxWidthPx}px` }} ref={containerRef}>
          <MasonryColumns
            items={items as unknown as MItem[]}
            cols={cols}
            colWidth={colWidth}
            gap={colGap}
            makeHref={(it) => `${BASE}/api/fs/${it.path}`}
            getAnchorProps={(it) => ({ "data-name": it.name })}
            onItemClick={(_, idx) => setViewerIndex(idx)}
            makeThumbSrc={(it) => `${BASE}/api/fs/${it.path}`}
            renderFooter={(it) => (
              <>
                <span className="truncate" title={it.name}>
                  {it.name}
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
