import path from "node:path";
import fs from "node:fs";
import Database from "better-sqlite3";

export const runtime = "nodejs";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "gallery-play.db");

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

let db: Database.Database | null = null;

export function getDb() {
  if (db) return db;
  ensureDir(DATA_DIR);
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY,
      rel_path TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      platform TEXT,
      user TEXT,
      size INTEGER NOT NULL,
      mtime_ms INTEGER NOT NULL,
      ctime_ms INTEGER NOT NULL,
      orig_width INTEGER,
      orig_height INTEGER,
      media_type TEXT,
      duration_ms INTEGER
    );
  CREATE INDEX IF NOT EXISTS idx_files_mtime ON files(mtime_ms DESC);
  CREATE INDEX IF NOT EXISTS idx_files_user ON files(user);
  CREATE INDEX IF NOT EXISTS idx_files_platform_user_mtime ON files(platform, user, mtime_ms DESC);
  `);
  return db;
}

export type DbFile = {
  id: number;
  rel_path: string;
  name: string;
  platform: string | null;
  user: string | null;
  size: number;
  mtime_ms: number;
  ctime_ms: number;
  orig_width: number | null;
  orig_height: number | null;
  media_type: string | null;
  duration_ms: number | null;
};

type UpsertInput = Omit<DbFile, "id" | "orig_width" | "orig_height" | "media_type" | "duration_ms"> & {
  orig_width?: number | null;
  orig_height?: number | null;
  media_type?: string | null;
  duration_ms?: number | null;
};

export function upsertFile(file: UpsertInput) {
  const d = getDb();
  const stmt = d.prepare(`
    INSERT INTO files(rel_path, name, platform, user, size, mtime_ms, ctime_ms, orig_width, orig_height, media_type, duration_ms)
    VALUES (@rel_path, @name, @platform, @user, @size, @mtime_ms, @ctime_ms, @orig_width, @orig_height, @media_type, @duration_ms)
    ON CONFLICT(rel_path) DO UPDATE SET
      name=excluded.name,
      platform=excluded.platform,
      user=excluded.user,
      size=excluded.size,
      mtime_ms=excluded.mtime_ms,
      ctime_ms=excluded.ctime_ms,
      orig_width=COALESCE(excluded.orig_width, files.orig_width),
      orig_height=COALESCE(excluded.orig_height, files.orig_height),
      media_type=COALESCE(excluded.media_type, files.media_type),
      duration_ms=COALESCE(excluded.duration_ms, files.duration_ms)
  `);
  stmt.run({
    ...file,
    orig_width: file.orig_width ?? null,
    orig_height: file.orig_height ?? null,
    media_type: file.media_type ?? null,
    duration_ms: file.duration_ms ?? null,
  });
}

export function getFileByRelPath(rel_path: string): DbFile | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM files WHERE rel_path=?").get(rel_path) as DbFile | undefined;
}

export function getFileById(id: number): DbFile | undefined {
  const d = getDb();
  return d.prepare("SELECT * FROM files WHERE id=?").get(id) as DbFile | undefined;
}

export function pageFilesByMTime(limit: number, cursorMtime?: number, cursorId?: number, platform?: string, user?: string, mediaType?: string) {
  const d = getDb();
  const where: string[] = [];
  const args: any[] = [];
  if (platform) {
    where.push("platform = ?");
    args.push(platform);
  }
  if (user) {
    where.push("user = ?");
    args.push(user);
  }
  if (mediaType) {
    where.push("media_type = ?");
    args.push(mediaType);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  if (cursorMtime == null) {
    const sql = `SELECT * FROM files ${whereSql} ORDER BY mtime_ms DESC, id DESC LIMIT ?`;
    const rows = d.prepare(sql).all(...args, limit) as DbFile[];
    return rows;
  }
  const sql = `SELECT * FROM files ${whereSql} ${
    whereSql ? "AND" : "WHERE"
  } (mtime_ms < ? OR (mtime_ms = ? AND id < ?)) ORDER BY mtime_ms DESC, id DESC LIMIT ?`;
  const rows = d.prepare(sql).all(...args, cursorMtime, cursorMtime, cursorId ?? Number.MAX_SAFE_INTEGER, limit) as DbFile[];
  return rows;
}

export function countFiles(platform?: string, user?: string, mediaType?: string): number {
  const d = getDb();
  const where: string[] = [];
  const args: any[] = [];
  if (platform) {
    where.push("platform = ?");
    args.push(platform);
  }
  if (user) {
    where.push("user = ?");
    args.push(user);
  }
  if (mediaType) {
    where.push("media_type = ?");
    args.push(mediaType);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const row = d.prepare(`SELECT COUNT(*) as c FROM files ${whereSql}`).get(...args) as { c: number };
  return row.c;
}

// pagination: pick the latest item per (platform, user) by mtime_ms,id DESC, then paginate by time DESC
export function pageLatestByUser(limit: number, cursorMtime?: number, cursorId?: number, platform?: string, mediaType?: string) {
  const d = getDb();
  const args: any[] = [];
  const whereParts: string[] = ["user IS NOT NULL", "platform IS NOT NULL"]; // required for navigation
  if (platform) {
    whereParts.push("platform = ?");
    args.push(platform);
  }
  if (mediaType) {
    whereParts.push("media_type = ?");
    args.push(mediaType);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";

  const base = `SELECT * FROM (
    SELECT id, rel_path, name, platform, user, size, mtime_ms, ctime_ms, orig_width, orig_height,
           ROW_NUMBER() OVER (PARTITION BY platform, user ORDER BY mtime_ms DESC, id DESC) AS rn
    FROM files
    ${whereSql}
  ) t WHERE rn = 1`;

  if (cursorMtime == null) {
    const sql = `${base} ORDER BY mtime_ms DESC, id DESC LIMIT ?`;
    return d.prepare(sql).all(...args, limit) as DbFile[];
  } else {
    const sql = `${base} AND (mtime_ms < ? OR (mtime_ms = ? AND id < ?)) ORDER BY mtime_ms DESC, id DESC LIMIT ?`;
    return d.prepare(sql).all(...args, cursorMtime, cursorMtime, cursorId ?? Number.MAX_SAFE_INTEGER, limit) as DbFile[];
  }
}

export function countDistinctUsers(platform?: string, mediaType?: string): number {
  const d = getDb();
  const args: any[] = [];
  const whereParts: string[] = ["user IS NOT NULL", "platform IS NOT NULL"]; // platform filter optional
  if (platform) {
    whereParts.push("platform = ?");
    args.push(platform);
  }
  if (mediaType) {
    whereParts.push("media_type = ?");
    args.push(mediaType);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(" AND ")}` : "";
  const row = d.prepare(`SELECT COUNT(*) as c FROM (SELECT 1 FROM files ${whereSql} GROUP BY platform, user) x`).get(...args) as { c: number };
  return row.c;
}

export function updateFileOrigDimensions(fileId: number, w: number, h: number) {
  const d = getDb();
  d.prepare("UPDATE files SET orig_width=COALESCE(orig_width, ?), orig_height=COALESCE(orig_height, ?) WHERE id=?").run(w, h, fileId);
}

export { DB_PATH, DATA_DIR };
