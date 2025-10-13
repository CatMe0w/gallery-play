import { NextRequest } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";
const GALLERY_DIR = process.env.GALLERY_DIR || path.join(process.cwd(), "gallery-dl");

function isSubPath(parent: string, child: string) {
  const rel = path.relative(parent, child);
  return !!rel && !rel.startsWith("..") && !path.isAbsolute(rel);
}

function contentTypeByExt(p: string) {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tiff":
      return "image/tiff";
    case ".avif":
      return "image/avif";
    case ".heic":
      return "image/heic";
    case ".jxl":
      return "image/jxl";
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mkv":
      return "video/x-matroska";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    case ".m4v":
      return "video/x-m4v";
    case ".mpeg":
    case ".mpg":
      return "video/mpeg";
    default:
      return "application/octet-stream";
  }
}

export async function GET(req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: paramPath } = await context.params;
  const rel = (paramPath || []).join("/");
  const abs = path.join(GALLERY_DIR, rel);

  // block path traversal
  const normalizedAbs = path.resolve(abs);
  const normalizedRoot = path.resolve(GALLERY_DIR);
  if (!isSubPath(normalizedRoot, normalizedAbs)) {
    return new Response("Forbidden", { status: 403 });
  }

  let stat: fs.Stats;
  try {
    stat = await fsp.stat(normalizedAbs);
    if (!stat.isFile()) throw new Error("not file");
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const stream = fs.createReadStream(normalizedAbs, { highWaterMark: 1 << 20 }); // 1MB
  const headers = new Headers();
  headers.set("Content-Type", contentTypeByExt(normalizedAbs));
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Content-Length", String(stat.size));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Last-Modified", stat.mtime.toUTCString());

  return new Response(stream as any, { headers });
}
