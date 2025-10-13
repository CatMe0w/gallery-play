import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["sharp", "better-sqlite3"],
};

export default nextConfig;
