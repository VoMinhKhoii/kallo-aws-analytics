import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Keep cross-architecture classroom builds within Docker Desktop's small VM.
  experimental: { cpus: 2 },
};

export default nextConfig;
