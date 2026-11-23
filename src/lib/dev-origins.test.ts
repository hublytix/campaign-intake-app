import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOOPBACK_DEV_ORIGINS } from "./dev-origins";
import nextConfig from "../../next.config";

describe("dev server load configuration", () => {
  it("allows localhost, 127.0.0.1, and IPv6 loopback as dev origins", () => {
    expect([...LOOPBACK_DEV_ORIGINS]).toEqual(["localhost", "127.0.0.1", "[::1]"]);
    expect(nextConfig.allowedDevOrigins).toEqual([...LOOPBACK_DEV_ORIGINS]);
  });

  it("renders the app dynamically so setup is not served as a stale static shell", () => {
    const layout = readFileSync(path.join(__dirname, "../app/layout.tsx"), "utf8");
    expect(layout).toMatch(/export const dynamic = ["']force-dynamic["']/);
  });
});
