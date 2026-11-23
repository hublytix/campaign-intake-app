import type { NextConfig } from "next";
import { LOOPBACK_DEV_ORIGINS } from "./src/lib/dev-origins";

const nextConfig: NextConfig = {
  // Local unpublished app: keep campaign and session data uncached.
  poweredByHeader: false,
  // Next 16 blocks dev requests from other loopback hosts unless listed.
  // The app is opened as both http://localhost:3000 and http://127.0.0.1:3000.
  allowedDevOrigins: [...LOOPBACK_DEV_ORIGINS],
  // Tailwind v4 is compiled through the Turbopack loader in both dev and build.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
