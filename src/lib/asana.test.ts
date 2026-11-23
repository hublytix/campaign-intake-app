import { describe, expect, it, vi } from "vitest";
import { AsanaApiError, AsanaClient, buildAuthorizeUrl } from "./asana";

describe("buildAuthorizeUrl", () => {
  it("includes state, PKCE challenge, redirect URI and requested scopes", () => {
    const url = new URL(
      buildAuthorizeUrl({
        clientId: "cid",
        redirectUri: "http://localhost:3000/api/asana/oauth/callback",
        state: "unguessable-state",
        codeChallenge: "challenge",
        scopes: ["projects:write", "tasks:write"],
      }),
    );
    expect(url.origin + url.pathname).toBe("https://app.asana.com/-/oauth_authorize");
    expect(url.searchParams.get("state")).toBe("unguessable-state");
    expect(url.searchParams.get("code_challenge")).toBe("challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("redirect_uri")).toContain("/api/asana/oauth/callback");
    expect(url.searchParams.get("scope")).toContain("projects:write");
    expect(url.searchParams.get("client_secret")).toBeNull();
  });
});

describe("AsanaClient", () => {
  it("sends a bearer token but never includes it in thrown errors", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ errors: [{ message: "boom" }] }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new AsanaClient({
      accessToken: "SUPER_SECRET_TOKEN",
      fetchImpl: fetchMock,
    });
    await expect(client.getWorkspace("111")).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(AsanaApiError);
      const text = `${(error as Error).message} ${JSON.stringify(error)}`;
      expect(text).not.toContain("SUPER_SECRET_TOKEN");
      return true;
    });
    const call = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const headers = new Headers(call[1].headers);
    expect(headers.get("Authorization")).toBe("Bearer SUPER_SECRET_TOKEN");
  });

  it("refuses to create a project outside the allow-list", async () => {
    const client = new AsanaClient({
      accessToken: "token",
      allowedWorkspaceGids: ["111"],
      fetchImpl: vi.fn(),
    });
    await expect(
      client.createProject({
        workspaceGid: "999",
        name: "FY27-NA-Event-Fall-Summit",
      }),
    ).rejects.toThrow(/allow-list/i);
    expect(client["fetchImpl"]).not.toHaveBeenCalled();
  });
});
