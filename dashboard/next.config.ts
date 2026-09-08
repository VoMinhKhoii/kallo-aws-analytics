import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // Keep cross-architecture classroom builds within Docker Desktop's small VM.
  experimental: { cpus: 2 },
};

export default nextConfig;
