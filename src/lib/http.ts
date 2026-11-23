import { inspectEnv } from "./config";
import { isTrustedRequestOrigin } from "./origin";

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function errorJson(message: string, status = 400, extra?: Record<string, unknown>): Response {
  return Response.json({ error: message, ...extra }, { status });
}

export function assertSameOrigin(
  request: Request,
  env: Record<string, string | undefined> = process.env,
): void {
  const origin = request.headers.get("origin");
  const method = request.method.toUpperCase();
  if (!origin) {
    // same-origin navigations may omit Origin; require it for mutating fetch
    if (method === "GET" || method === "HEAD") return;
    throw Object.assign(new Error("Origin header required."), { status: 403 });
  }
  const { appBaseUrl } = inspectEnv(env);
  if (
    !isTrustedRequestOrigin({
      originHeader: origin,
      requestUrl: request.url,
      appBaseUrl,
    })
  ) {
    throw Object.assign(new Error("Cross-origin request blocked."), { status: 403 });
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw Object.assign(new Error("Invalid JSON body."), { status: 400 });
  }
}

export function statusOf(error: unknown, fallback = 500): number {
  if (error && typeof error === "object" && "status" in error) {
    const value = Number((error as { status: number }).status);
    if (Number.isFinite(value) && value >= 400) return value;
  }
  return fallback;
}
