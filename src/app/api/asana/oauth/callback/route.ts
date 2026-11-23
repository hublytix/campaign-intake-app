import { cookies } from "next/headers";
import { inspectEnv } from "@/lib/config";
import { cookieSecure, requireSession } from "@/lib/route-helpers";
import { completeOAuth } from "@/lib/service";
import { OAUTH_COOKIE, cookieOptions, readOauthCookie } from "@/lib/session";

export const runtime = "nodejs";

function redirectTo(path: string, request: Request) {
  const { appBaseUrl } = inspectEnv();
  return Response.redirect(new URL(path, appBaseUrl || request.url), 302);
}

export async function GET(request: Request) {
  const session = await requireSession();
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const store = await cookies();

  const clear = () =>
    store.set(OAUTH_COOKIE, "", cookieOptions(0, cookieSecure()));

  if (error || !code) {
    clear();
    return redirectTo("/setup?asana=denied", request);
  }

  try {
    const payload = readOauthCookie(store.get(OAUTH_COOKIE)?.value, state);
    await completeOAuth({ code, verifier: payload.verifier, orgId: session.orgId });
    clear();
    return redirectTo(`${payload.returnPath}?asana=connected`, request);
  } catch (caught) {
    clear();
    const status = caught && typeof caught === "object" && "status" in caught
      ? Number((caught as { status: number }).status)
      : 500;
    const dest = status === 422 ? "/setup?asana=state" : "/setup?asana=error";
    return redirectTo(dest, request);
  }
}
