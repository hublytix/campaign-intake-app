import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local unpublished app: keep campaign and session data uncached.
  poweredByHeader: false,
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
