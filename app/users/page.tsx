"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MasonryColumns, { type MItem } from "../../components/MasonryColumns";
import { useColumnSetting } from "../../lib/columns";
import { COL_WIDTH, COL_GAP } from "../../lib/constants";
import Link from "next/link";

type UserCover = {
  id: number;
  path: string;
  name: string;
  platform: string | null;
  user: string | null;
  mtimeMs?: number;
  width?: number | null;
  height?: number | null;
};

type Cursor = { cursorMtime: string; cursorId: string } | null;

async function fetchUsers(cursor?: Cursor, limit = 60, platform?: string) {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (cursor?.cursorMtime) params.set("cursorMtime", cursor.cursorMtime);
  if (cursor?.cursorId) params.set("cursorId", cursor.cursorId);
  if (platform) params.set("platform", platform);
  const res = await fetch(`/api/users?${params.toString()}`);
  if (!res.ok) throw new Error(`failed: ${res.status}`);
  return res.json() as Promise<{ items: UserCover[]; nextCursor: Cursor; total: number }>;
}

export default function UsersPage() {
  const [items, setItems] = useState<UserCover[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const { cols, setCols, maxWidthPx } = useColumnSetting(3);

  const mergeUniqueUsers = useCallback((prev: UserCover[], incoming: UserCover[]) => {
    // De-duplicate by unique platform+user key
    const key = (u: UserCover) => `${u.platform ?? ""}::${u.user ?? ""}`;
    const map = new Map<string, UserCover>();
    for (const it of prev) map.set(key(it), it);
    for (const it of incoming) if (!map.has(key(it))) map.set(key(it), it);
    return Array.from(map.values());
  }, []);

  const loadMore = useCallback(async () => {
    if (loading || done) return;
    setLoading(true);
    try {
      const data = await fetchUsers(cursor, 60);
      setItems((prev) => mergeUniqueUsers(prev, data.items));
      setCursor(data.nextCursor);
      setDone(!data.nextCursor);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }, [cursor, loading, done]);

  useEffect(() => {
    loadMore();
  }, []);

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

  const masonryItems = useMemo(() => items as unknown as MItem[], [items]);

  return (
    <>
      {/* Top Bar */}
      <div className="sticky top-0 z-50 border-b border-neutral-300 bg-white/80 dark:bg-black/60 backdrop-blur">
        <div className="w-full mx-auto px-4 sm:px-6" style={{ maxWidth: `${maxWidthPx}px` }}>
          <header className="py-3 flex items-center justify-between">
            <div className="opacity-70">{total != null ? `Total users: ${total}` : "Loading..."}</div>
            <div className="flex gap-3 items-center">
              <label className="flex items-center gap-2">
                <span>Columns</span>
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
                Back to all
              </Link>
            </div>
          </header>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-screen px-4 sm:px-6 pt-4 sm:pt-6 flex flex-col items-center">
        <div className="w-full mx-auto" style={{ maxWidth: `${maxWidthPx}px` }}>
          <MasonryColumns
            items={masonryItems}
            cols={cols}
            colWidth={COL_WIDTH}
            gap={COL_GAP}
            makeHref={(it) => `/user/${it.platform}/${it.user}`}
            makeThumbSrc={(it) => `/api/fs/${it.path}`}
            renderFooter={(it) => (
              <>
                <span className="truncate">
                  {it.platform}/{it.user}
                </span>
              </>
            )}
          />

          <div ref={sentinelRef} className="h-12 flex items-center justify-center text-neutral-500">
            {done ? "No more" : loading ? "Loading..." : "Scroll to load more"}
          </div>
        </div>
      </div>
    </>
  );
}
