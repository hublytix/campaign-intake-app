import { inspectEnv } from "./config";
import { createPkcePair, decryptSecret, encryptSecret, randomUrlSafe } from "./crypto";
import { ensureDefaultOrg } from "./db";
import { getSessionKey } from "./keys";

export const SESSION_COOKIE = "cia_session";
export const OAUTH_COOKIE = "cia_oauth";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const OAUTH_TTL_MS = 10 * 60 * 1000;

export interface SessionPayload {
  v: 1;
  orgId: string;
  sid: string;
  iat: number;
  exp: number;
}

export interface OauthCookiePayload {
  v: 1;
  state: string;
  verifier: string;
  challenge: string;
  returnPath: string;
  exp: number;
}

export function cookieOptions(maxAgeSeconds: number, secure: boolean) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function createSessionPayload(orgId = ensureDefaultOrg()): SessionPayload {
  const now = Date.now();
  return {
    v: 1,
    orgId,
    sid: randomUrlSafe(18),
    iat: now,
    exp: now + SESSION_TTL_MS,
  };
}

export function sealPayload(payload: object, key = getSessionKey()): string {
  return encryptSecret(JSON.stringify(payload), key);
}

export function openPayload<T>(token: string, key = getSessionKey()): T {
  return JSON.parse(decryptSecret(token, key)) as T;
}

export function readSession(cookieValue: string | undefined): SessionPayload | null {
  if (!cookieValue) return null;
  try {
    const payload = openPayload<SessionPayload>(cookieValue);
    if (payload.v !== 1 || payload.exp < Date.now() || !payload.orgId) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createOauthPayload(returnPath = "/setup"): OauthCookiePayload {
  const pkce = createPkcePair();
  return {
    v: 1,
    state: randomUrlSafe(32),
    verifier: pkce.verifier,
    challenge: pkce.challenge,
    returnPath: returnPath.startsWith("/") ? returnPath : "/setup",
    exp: Date.now() + OAUTH_TTL_MS,
  };
}

export function readOauthCookie(
  cookieValue: string | undefined,
  state: string,
): OauthCookiePayload {
  if (!cookieValue) {
    const error = new Error("Missing OAuth state cookie.");
    (error as Error & { status: number }).status = 422;
    throw error;
  }
  let payload: OauthCookiePayload;
  try {
    payload = openPayload<OauthCookiePayload>(cookieValue);
  } catch {
    const error = new Error("Invalid OAuth state.");
    (error as Error & { status: number }).status = 422;
    throw error;
  }
  if (payload.v !== 1 || payload.exp < Date.now() || payload.state !== state) {
    const error = new Error("OAuth state mismatch.");
    (error as Error & { status: number }).status = 422;
    throw error;
  }
  return payload;
}

export function publicAppState() {
  const inspection = inspectEnv();
  return {
    mode: inspection.mode,
    missing: inspection.missing,
    present: inspection.present,
    allowedWorkspaceGids: inspection.allowedWorkspaceGids,
    appBaseUrl: inspection.appBaseUrl,
  };
}
