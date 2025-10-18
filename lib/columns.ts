"use client";

import { useEffect, useMemo, useState } from "react";
import { COL_WIDTH, COL_GAP, COL_GAP_MOBILE, COL_WIDTH_MOBILE } from "./constants";

export type Cols = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

const KEY = "gallery.cols";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export function useColumnSetting(defaultCols: Cols = 3) {
  const [cols, setColsState] = useState<Cols>(defaultCols);
  const isMobile = useIsMobile();

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

  const colGap = isMobile ? COL_GAP_MOBILE : COL_GAP;
  const colWidth = isMobile ? COL_WIDTH_MOBILE : COL_WIDTH;

  const maxWidthPx = useMemo(() => cols * colWidth + (cols - 1) * colGap, [cols, colWidth, colGap]);
  const columnStyle = useMemo(() => ({ columnCount: cols, columnGap: `${colGap}px` } as React.CSSProperties), [cols, colGap]);

  return { cols, setCols, maxWidthPx, columnStyle, colWidth, colGap };
}
