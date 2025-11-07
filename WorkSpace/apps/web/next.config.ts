import type { NextConfig } from "next";

// Simplified config for Vercel: avoid tracing outside the web app directory.
// Vercel handles output/tracing automatically; no need for custom root.
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
