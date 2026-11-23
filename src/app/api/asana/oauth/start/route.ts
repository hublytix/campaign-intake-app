import { ASANA_SCOPES, asanaRedirectUri, inspectEnv } from "@/lib/config";
import { buildAuthorizeUrl } from "@/lib/asana";
import { errorJson } from "@/lib/http";
import { cookieSecure, requireSession } from "@/lib/route-helpers";
import {
  OAUTH_COOKIE,
  cookieOptions,
  createOauthPayload,
  sealPayload,
} from "@/lib/session";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireSession();
  const inspection = inspectEnv();
  if (inspection.mode !== "real") {
    return errorJson(
      inspection.mode === "demo"
        ? "Demo mode is on because Asana OAuth is not configured. No real connection can be started."
        : "Asana OAuth is blocked until every required environment variable is set.",
      409,
      { mode: inspection.mode, missing: inspection.missing },
    );
  }
  const returnPath = new URL(request.url).searchParams.get("returnPath") || "/setup";
  const payload = createOauthPayload(returnPath);
  const authorize = buildAuthorizeUrl({
    clientId: process.env.ASANA_CLIENT_ID!,
    redirectUri: asanaRedirectUri(),
    state: payload.state,
    codeChallenge: payload.challenge,
    scopes: [...ASANA_SCOPES],
  });
  const response = new Response(null, {
    status: 302,
    headers: { Location: authorize },
  });
  const { cookies } = await import("next/headers");
  const store = await cookies();
  store.set(OAUTH_COOKIE, sealPayload(payload), cookieOptions(10 * 60, cookieSecure()));
  return response;
}
