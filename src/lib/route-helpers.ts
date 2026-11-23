import { cookies } from "next/headers";
import { inspectEnv } from "./config";
import { ensureDefaultOrg } from "./db";
import {
  SESSION_COOKIE,
  cookieOptions,
  createSessionPayload,
  readSession,
  sealPayload,
  type SessionPayload,
} from "./session";

export async function requireSession(): Promise<SessionPayload> {
  ensureDefaultOrg();
  const store = await cookies();
  const existing = readSession(store.get(SESSION_COOKIE)?.value);
  if (existing) return existing;
  const payload = createSessionPayload();
  const secure = inspectEnv().appBaseUrl.startsWith("https:");
  store.set(SESSION_COOKIE, sealPayload(payload), cookieOptions(7 * 24 * 60 * 60, secure));
  return payload;
}

export function cookieSecure(): boolean {
  return inspectEnv().appBaseUrl.startsWith("https:");
}
