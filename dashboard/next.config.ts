import type { NextConfig } from "next";

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
