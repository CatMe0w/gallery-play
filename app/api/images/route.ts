import { NextRequest } from "next/server";
import path from "node:path";
import { countFiles, pageFilesByMTime } from "../../../lib/db";
import { indexAll } from "../../../lib/indexer";

export const runtime = "nodejs";
const GALLERY_DIR = process.env.GALLERY_DIR || path.join(process.cwd(), "gallery-dl");

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit")) || 60));
  const cursorM = searchParams.get("cursorMtime");
  const cursorId = searchParams.get("cursorId");
  const refresh = searchParams.get("refresh") === "1" || searchParams.get("refresh") === "true";
  const platform = searchParams.get("platform") || undefined;
  const user = searchParams.get("user") || undefined;
  const mediaType = searchParams.get("type") || undefined; // "image" | "video"

  if (refresh) {
    await indexAll();
  }

  if (countFiles() === 0) {
    await indexAll();
  }

  const rows = pageFilesByMTime(limit, cursorM ? Number(cursorM) : undefined, cursorId ? Number(cursorId) : undefined, platform, user, mediaType);
  const total = countFiles(platform, user, mediaType);
  const items = rows.map((r) => ({
    path: r.rel_path,
    name: r.name,
    size: r.size,
    mtimeMs: r.mtime_ms,
    user: r.user,
    platform: r.platform,
    id: r.id,
    width: r.orig_width ?? null,
    height: r.orig_height ?? null,
    mediaType: r.media_type ?? null,
    durationMs: r.duration_ms ?? null,
  }));
  const last = rows[rows.length - 1];
  const nextCursor = last ? { cursorMtime: String(last.mtime_ms), cursorId: String(last.id) } : null;

  return Response.json(
    {
      items,
      nextCursor,
      total,
      galleryDir: GALLERY_DIR,
    },
    { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } }
  );
}
