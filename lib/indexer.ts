import path from "node:path";
import fs from "node:fs/promises";
import { getDb, upsertFile } from "./db";
import sharp from "sharp";
import { spawn } from "node:child_process";

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".avif", ".heic", ".jxl"]);
const VID_EXT = new Set([".mp4", ".webm", ".mkv", ".mov", ".avi", ".m4v", ".mpeg", ".mpg"]);

export const GALLERY_DIR = process.env.GALLERY_DIR || path.join(process.cwd(), "gallery-dl");

async function safeStat(p: string) {
  try {
    return await fs.stat(p);
  } catch {
    return null;
  }
}

async function* walkDir(root: string, sub = ""): AsyncGenerator<string> {
  const dir = path.join(root, sub);
  let entries: any[] = [];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const rel = path.join(sub, ent.name);
    if (ent.isDirectory()) {
      yield* walkDir(root, rel);
    } else if (ent.isFile()) {
      const ext = path.extname(ent.name).toLowerCase();
      if (IMG_EXT.has(ext) || VID_EXT.has(ext)) {
        yield rel.replace(/\\/g, "/");
      }
    }
  }
}

function parsePlatformUser(rel: string): { platform: string | null; user: string | null; name: string } {
  const parts = rel.split("/");
  const platform = parts[0] ?? null;
  const user = parts.length > 1 ? parts[1] : null;
  const name = parts[parts.length - 1] ?? rel;
  return { platform, user, name };
}

function ffprobeJson(filePath: string): Promise<any | null> {
  return new Promise((resolve) => {
    const p = spawn("ffprobe", ["-v", "error", "-print_format", "json", "-show_entries", "format=duration:stream=width,height,duration,codec_type", filePath], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d.toString()));
    p.on("close", () => {
      try {
        resolve(JSON.parse(out));
      } catch {
        resolve(null);
      }
    });
    p.on("error", () => resolve(null));
  });
}

export async function indexAll(): Promise<{ count: number }> {
  const root = GALLERY_DIR;
  const db = getDb();
  const upserts: Array<{
    rel: string;
    abs: string;
    st: any;
    platform: string | null;
    user: string | null;
    name: string;
    w?: number | null;
    h?: number | null;
    mediaType?: string | null;
    duration?: number | null;
  }> = [];
  for await (const rel of walkDir(root)) {
    const abs = path.join(root, rel);
    const st = await safeStat(abs);
    if (!st || !st.isFile()) continue;
    const { platform, user, name } = parsePlatformUser(rel);
    upserts.push({ rel, abs, st, platform, user, name });
    if (upserts.length >= 1000) {
      const batch = upserts.splice(0, upserts.length);
      // read image dimensions / video info
      const chunkSize = 16;
      for (let i = 0; i < batch.length; i += chunkSize) {
        const slice = batch.slice(i, i + chunkSize);
        await Promise.all(
          slice.map(async (r) => {
            const ext = path.extname(r.abs).toLowerCase();
            if (IMG_EXT.has(ext)) {
              try {
                const meta = await sharp(r.abs, { failOnError: false }).metadata();
                r.w = meta.width ?? null;
                r.h = meta.height ?? null;
                r.mediaType = "image";
                r.duration = null;
              } catch {
                r.w = null;
                r.h = null;
                r.mediaType = "image";
                r.duration = null;
              }
            } else if (VID_EXT.has(ext)) {
              r.mediaType = "video";
              const info = await ffprobeJson(r.abs);
              if (info) {
                const v = (info.streams || []).find((s: any) => s.codec_type === "video") || {};
                r.w = (v.width as number) ?? null;
                r.h = (v.height as number) ?? null;
                const dur = Number((v.duration as string) || (info.format?.duration as string) || "0");
                r.duration = isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : null;
              } else {
                r.w = null;
                r.h = null;
                r.duration = null;
              }
            }
          })
        );
      }
      db.transaction((rows: typeof batch) => {
        for (const r of rows) {
          upsertFile({
            rel_path: r.rel,
            name: r.name,
            platform: r.platform,
            user: r.user,
            size: r.st.size,
            mtime_ms: r.st.mtimeMs,
            ctime_ms: r.st.ctimeMs,
            orig_width: r.w ?? null,
            orig_height: r.h ?? null,
            media_type: r.mediaType ?? null,
            duration_ms: r.duration ?? null,
          });
        }
      })(batch);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  if (upserts.length) {
    const batch = upserts.splice(0, upserts.length);
    const chunkSize = 16;
    for (let i = 0; i < batch.length; i += chunkSize) {
      const slice = batch.slice(i, i + chunkSize);
      await Promise.all(
        slice.map(async (r) => {
          const ext = path.extname(r.abs).toLowerCase();
          if (IMG_EXT.has(ext)) {
            try {
              const meta = await sharp(r.abs, { failOnError: false }).metadata();
              r.w = meta.width ?? null;
              r.h = meta.height ?? null;
              r.mediaType = "image";
              r.duration = null;
            } catch {
              r.w = null;
              r.h = null;
              r.mediaType = "image";
              r.duration = null;
            }
          } else if (VID_EXT.has(ext)) {
            r.mediaType = "video";
            const info = await ffprobeJson(r.abs);
            if (info) {
              const v = (info.streams || []).find((s: any) => s.codec_type === "video") || {};
              r.w = (v.width as number) ?? null;
              r.h = (v.height as number) ?? null;
              const dur = Number((v.duration as string) || (info.format?.duration as string) || "0");
              r.duration = isFinite(dur) && dur > 0 ? Math.round(dur * 1000) : null;
            } else {
              r.w = null;
              r.h = null;
              r.duration = null;
            }
          }
        })
      );
    }
    db.transaction((rows: typeof batch) => {
      for (const r of rows) {
        upsertFile({
          rel_path: r.rel,
          name: r.name,
          platform: r.platform,
          user: r.user,
          size: r.st.size,
          mtime_ms: r.st.mtimeMs,
          ctime_ms: r.st.ctimeMs,
          orig_width: r.w ?? null,
          orig_height: r.h ?? null,
          media_type: r.mediaType ?? null,
          duration_ms: r.duration ?? null,
        });
      }
    })(batch);
  }
  return { count: 0 };
}
