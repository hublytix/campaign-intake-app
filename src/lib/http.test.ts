import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "./http";
import { createOauthPayload, readOauthCookie, sealPayload } from "./session";

describe("assertSameOrigin", () => {
  it("allows a matching origin and blocks a cross-origin POST", () => {
    process.env.APP_BASE_URL = "http://localhost:3000";
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/campaigns", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        }),
      ),
    ).not.toThrow();
    expect(() =>
      assertSameOrigin(
        new Request("http://localhost:3000/api/campaigns", {
          method: "POST",
          headers: { origin: "https://evil.example" },
        }),
      ),
    ).toThrow(/cross-origin/i);
  });
});

describe("OAuth state cookie", () => {
  it("rejects a missing or mismatched state with status 422", () => {
    delete process.env.ASANA_CLIENT_ID;
    delete process.env.ASANA_CLIENT_SECRET;
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.SESSION_SECRET;
    delete process.env.ASANA_ALLOWED_WORKSPACE_GID;
    process.env.DATABASE_PATH = "/tmp/cia-oauth-test.sqlite";
    const payload = createOauthPayload("/setup");
    const cookie = sealPayload(payload);
    expect(readOauthCookie(cookie, payload.state).verifier).toBe(payload.verifier);
    try {
      readOauthCookie(undefined, payload.state);
      throw new Error("expected throw");
    } catch (error) {
      expect((error as Error & { status: number }).status).toBe(422);
    }
    try {
      readOauthCookie(cookie, "different-state");
      throw new Error("expected throw");
    } catch (error) {
      expect((error as { status?: number }).status).toBe(422);
    }
  });
});
