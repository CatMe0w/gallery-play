"use client";

import React, { useCallback, useEffect, useMemo } from "react";
import type { MItem } from "./MasonryColumns";

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

export type LightboxViewerProps = {
  items: MItem[];
  index: number; // current index being viewed
  onClose: () => void;
  onNavigate?: (nextIndex: number) => void; // optional (arrow left/right) navigation control
};

export default function LightboxViewer({ items, index, onClose, onNavigate }: LightboxViewerProps) {
  const it = items[index];

  const src = useMemo(() => {
    if (!it) return "";
    if (it.mediaType === "video") return `${BASE}/api/fs/${it.path}`;
    return `${BASE}/api/fs/${it.path}`;
  }, [it]);

  const title = useMemo(() => {
    if (!it) return "";
    const parts = [it.platform, it.user, it.name].filter(Boolean);
    return parts.join(" / ");
  }, [it]);

  const go = useCallback(
    (delta: number) => {
      const next = Math.min(items.length - 1, Math.max(0, index + delta));
      if (next !== index) onNavigate?.(next);
    },
    [index, items.length, onNavigate]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  if (!it) return null;

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div className="fixed inset-0 z-[100] bg-black/90 flex flex-col" onClick={onClose} role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 text-white">
        <div className="truncate" title={title}>
          {title}
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded bg-white/10 hover:bg-white/20"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
          >
            Close
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0 relative">
        <button
          aria-label="Previous"
          onClick={(e) => {
            e.stopPropagation();
            go(-1);
          }}
          className="absolute left-2 top-1/2 -translate-y-1/2 z-10 px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-xl"
        >
          ◀
        </button>
        <button
          aria-label="Next"
          onClick={(e) => {
            e.stopPropagation();
            go(1);
          }}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-10 px-3 py-2 rounded bg-white/10 hover:bg-white/20 text-white text-xl"
        >
          ▶
        </button>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          {it.mediaType === "video" ? (
            <video src={src} controls autoPlay style={{ maxWidth: "100%", maxHeight: "100%" }} onClick={stop} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={it.name} style={{ maxWidth: "100%", maxHeight: "100%" }} onClick={stop} />
          )}
        </div>
      </div>
    </div>
  );
}
