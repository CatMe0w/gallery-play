import { NextRequest } from "next/server";
import { countDistinctUsers, pageLatestByUser } from "../../../lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.max(1, Math.min(200, Number(searchParams.get("limit")) || 60));
  const cursorM = searchParams.get("cursorMtime");
  const cursorId = searchParams.get("cursorId");
  const platform = searchParams.get("platform") || undefined;

  // use images only as covers; ignore videos
  const rows = pageLatestByUser(limit, cursorM ? Number(cursorM) : undefined, cursorId ? Number(cursorId) : undefined, platform, "image");
  const total = countDistinctUsers(platform, "image");
  const items = rows.map((r) => ({
    id: r.id,
    path: r.rel_path,
    name: r.name,
    platform: r.platform,
    user: r.user,
    mtimeMs: r.mtime_ms,
    width: r.orig_width ?? null,
    height: r.orig_height ?? null,
  }));
  const last = rows[rows.length - 1];
  const nextCursor = last ? { cursorMtime: String(last.mtime_ms), cursorId: String(last.id) } : null;

  return Response.json({ items, nextCursor, total }, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=600" } });
}
