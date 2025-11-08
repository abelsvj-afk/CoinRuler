import type { NextConfig } from "next";

// Simplified config for Vercel: avoid tracing outside the web app directory.
// Vercel handles output/tracing automatically; no need for custom root.
// Note: turbopack.root is not in Next's types yet; suppress TS for this field.
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
    // @ts-ignore - unofficial typing
    turbopack: {
      root: process.cwd(),
    },
  },
} satisfies NextConfig as any;

export default nextConfig;
