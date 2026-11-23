import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local unpublished app: keep campaign and session data uncached.
  poweredByHeader: false,
};

export default nextConfig;
