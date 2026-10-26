import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  async redirects() { return [
    {source: '/analytics', destination: '/', permanent: true},
    {source: '/trace', destination: '/traces', permanent: true},
    {source: '/trace/:id', destination: '/traces/:id', permanent: true},
    {source: '/requests', destination: '/traces', permanent: true},
    {source: '/coverage', destination: '/ingredients', permanent: true},
    {source: '/retrieval', destination: '/ingredients', permanent: true},
    {source: '/pipeline', destination: '/ai', permanent: true},
  ]; },
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // Keep cross-architecture classroom builds within Docker Desktop's small VM.
  experimental: { cpus: 2 },
};

export default nextConfig;

// `next dev` gets the wrangler.jsonc bindings (the TRACES D1 database, rate limiters) from a local Miniflare.
if (process.env.NODE_ENV === "development") void initOpenNextCloudflareForDev();
