import { afterEach, describe, expect, it } from "vitest";
import { assertSameOrigin } from "./http";
import { isTrustedRequestOrigin, trustedOrigins } from "./origin";
import { createOauthPayload, readOauthCookie, sealPayload } from "./session";

function post(url: string, origin?: string) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(origin ? { origin } : {}),
    },
    body: "{}",
  });
}

const LOCAL_ENV = { APP_BASE_URL: "http://localhost:3000" };
const PROD_ENV = { APP_BASE_URL: "https://app.example.com" };

afterEach(() => {
  delete process.env.APP_BASE_URL;
});

describe("trustedOrigins", () => {
  it("expands only loopback aliases for a local APP_BASE_URL", () => {
    const origins = trustedOrigins("http://localhost:3000");
    expect(origins).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://[::1]:3000",
      ]),
    );
    expect(origins).not.toContain("https://localhost:3000");
  });

  it("does not add loopback aliases for a deployed origin", () => {
    expect(trustedOrigins("https://app.example.com")).toEqual(["https://app.example.com"]);
  });
});

describe("assertSameOrigin", () => {
  it("allows a configured localhost origin", () => {
    expect(() =>
      assertSameOrigin(post("http://localhost:3000/api/campaigns", "http://localhost:3000"), LOCAL_ENV),
    ).not.toThrow();
  });

  it("allows the QA browser case: 127.0.0.1 page against a localhost APP_BASE_URL", () => {
    expect(() =>
      assertSameOrigin(
        post("http://127.0.0.1:3000/api/campaigns", "http://127.0.0.1:3000"),
        LOCAL_ENV,
      ),
    ).not.toThrow();
  });

  it("allows localhost page when APP_BASE_URL is the 127.0.0.1 form", () => {
    expect(() =>
      assertSameOrigin(
        post("http://localhost:3000/api/settings", "http://localhost:3000"),
        { APP_BASE_URL: "http://127.0.0.1:3000" },
      ),
    ).not.toThrow();
  });

  it("allows IPv6 loopback on the same scheme and port", () => {
    expect(() =>
      assertSameOrigin(post("http://[::1]:3000/api/campaigns", "http://[::1]:3000"), LOCAL_ENV),
    ).not.toThrow();
  });

  it("blocks a missing Origin on mutations but allows GET", () => {
    expect(() => assertSameOrigin(post("http://127.0.0.1:3000/api/campaigns"), LOCAL_ENV)).toThrow(
      /origin header required/i,
    );
    expect(() =>
      assertSameOrigin(
        new Request("http://127.0.0.1:3000/api/bootstrap", { method: "GET" }),
        LOCAL_ENV,
      ),
    ).not.toThrow();
  });

  it("blocks malicious and look-alike origins", () => {
    const requestUrl = "http://127.0.0.1:3000/api/campaigns";
    for (const origin of [
      "https://evil.example",
      "http://evil.example",
      "http://localhost.evil.example",
      "http://evil.localhost:3000",
      "http://127.0.0.1.attacker.test:3000",
      "http://localhost:3001",
      "https://localhost:3000",
      "https://127.0.0.1:3000",
      "http://127.0.0.1:3001",
      "null",
      "http://localhost:3000/api",
    ]) {
      expect(
        () => assertSameOrigin(post(requestUrl, origin), LOCAL_ENV),
        origin,
      ).toThrow(/cross-origin/i);
    }
  });

  it("does not treat loopback as trusted when APP_BASE_URL is a public site", () => {
    expect(() =>
      assertSameOrigin(
        post("http://127.0.0.1:3000/api/campaigns", "http://127.0.0.1:3000"),
        PROD_ENV,
      ),
    ).toThrow(/cross-origin/i);
    expect(() =>
      assertSameOrigin(
        post("https://app.example.com/api/campaigns", "https://app.example.com"),
        PROD_ENV,
      ),
    ).not.toThrow();
  });

  it("rejects an origin that does not match the request host", () => {
    expect(
      isTrustedRequestOrigin({
        originHeader: "http://localhost:3000",
        requestUrl: "http://192.168.1.20:3000/api/campaigns",
        appBaseUrl: "http://localhost:3000",
      }),
    ).toBe(false);
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
