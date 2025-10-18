import { NextRequest } from "next/server";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { DATA_DIR, getFileByRelPath } from "../../../../lib/db";
import { COL_WIDTH } from "../../../../lib/constants";

export const runtime = "nodejs";

const GALLERY_DIR = process.env.GALLERY_DIR || path.join(process.cwd(), "gallery-dl");
const VTHUMB_DIR = process.env.VTHUMB_DIR || path.join(DATA_DIR, "vthumbs");

function ensureDirSync(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

export async function GET(_req: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path: p } = await context.params;
  const rel = (p || []).join("/");

  const rec = getFileByRelPath(rel);
  if (!rec) return new Response("Not found", { status: 404 });

  const srcAbs = path.join(GALLERY_DIR, rel);
  let srcStat: fs.Stats;
  try {
    srcStat = await fsp.stat(srcAbs);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  const width = COL_WIDTH;
  ensureDirSync(VTHUMB_DIR);
  const cacheSub = Math.floor(rec.id / 1000).toString();
  const outDir = path.join(VTHUMB_DIR, cacheSub);
  ensureDirSync(outDir);
  const outPath = path.join(outDir, `${rec.id}_${width}.webp`);

  try {
    const st = await fsp.stat(outPath);
    if (st.mtimeMs >= srcStat.mtimeMs) {
      const stream = fs.createReadStream(outPath);
      return new Response(stream as any, {
        headers: {
          "Content-Type": "image/webp",
          "Cache-Control": "public, max-age=31536000, immutable",
        },
      });
    }
  } catch {}

  // seek at 10% of duration, between 1s and (duration - 1s)
  const durMs = rec.duration_ms ?? 0;
  const seekSec = durMs > 0 ? Math.min(Math.max(Math.round(durMs * 0.1) / 1000, 1), Math.round(durMs / 1000) - 1 || 1) : 1;

  // generate single-frame webp thumbnail
  await new Promise<void>((resolve, reject) => {
    const args = [
      "-v",
      "error",
      "-nostats",
      "-nostdin",
      "-y",
      "-ss",
      String(seekSec),
      "-i",
      srcAbs,
      "-frames:v",
      "1",
      "-vf",
      `scale=${width}:-1:force_original_aspect_ratio=decrease`,
      "-vcodec",
      "webp",
      outPath,
    ];
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "ignore"] });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}`))));
  });

  const stream = fs.createReadStream(outPath);
  return new Response(stream as any, {
    headers: {
      "Content-Type": "image/webp",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
