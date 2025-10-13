"use client";

import { useEffect, useMemo, useState } from "react";
import { COL_WIDTH, COL_GAP } from "./constants";

export type Cols = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const KEY = "gallery.cols";

export function useColumnSetting(defaultCols: Cols = 3) {
  const [cols, setColsState] = useState<Cols>(defaultCols);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const n = Number(raw);
        if (Number.isFinite(n)) setColsState(Math.max(1, Math.min(10, Math.floor(n))) as Cols);
      }
    } catch {}
  }, []);

  const setCols = (n: Cols | number) => {
    const v = Math.max(1, Math.min(10, Math.floor(Number(n)))) as Cols;
    setColsState(v);
    try {
      localStorage.setItem(KEY, String(n));
    } catch {}
  };

  const maxWidthPx = useMemo(() => cols * COL_WIDTH + (cols - 1) * COL_GAP, [cols]);
  const columnStyle = useMemo(() => ({ columnCount: cols, columnGap: `${COL_GAP}px` } as React.CSSProperties), [cols]);

  return { cols, setCols, maxWidthPx, columnStyle };
}
