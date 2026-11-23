import type { AppMode } from "./types";

export const REAL_MODE_REQUIRED = [
  "ASANA_CLIENT_ID",
  "ASANA_CLIENT_SECRET",
  "TOKEN_ENCRYPTION_KEY",
  "SESSION_SECRET",
  "ASANA_ALLOWED_WORKSPACE_GID",
] as const;

export type RealModeVar = (typeof REAL_MODE_REQUIRED)[number];

export interface EnvInspection {
  mode: AppMode;
  present: RealModeVar[];
  missing: RealModeVar[];
  allowedWorkspaceGids: string[];
  appBaseUrl: string;
}

function read(env: Record<string, string | undefined>, name: string): string {
  return (env[name] ?? "").trim();
}

export function presentRealModeVars(
  env: Record<string, string | undefined> = process.env,
): { present: RealModeVar[]; missing: RealModeVar[] } {
  const present: RealModeVar[] = [];
  const missing: RealModeVar[] = [];
  for (const name of REAL_MODE_REQUIRED) {
    if (read(env, name)) present.push(name);
    else missing.push(name);
  }
  return { present, missing };
}

export function parseWorkspaceAllowList(
  raw: string | undefined,
): string[] {
  return (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function resolveAppMode(
  env: Record<string, string | undefined> = process.env,
): AppMode {
  const { present, missing } = presentRealModeVars(env);
  if (missing.length === 0) return "real";
  if (present.length === 0) return "demo";
  return "misconfigured";
}

export function inspectEnv(
  env: Record<string, string | undefined> = process.env,
): EnvInspection {
  const { present, missing } = presentRealModeVars(env);
  const mode = resolveAppMode(env);
  const appBaseUrl = (read(env, "APP_BASE_URL") || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
  return {
    mode,
    present,
    missing,
    allowedWorkspaceGids: parseWorkspaceAllowList(
      env.ASANA_ALLOWED_WORKSPACE_GID,
    ),
    appBaseUrl,
  };
}

export function asanaRedirectUri(
  env: Record<string, string | undefined> = process.env,
): string {
  return `${inspectEnv(env).appBaseUrl}/api/asana/oauth/callback`;
}

export const ASANA_SCOPES = [
  "openid",
  "email",
  "profile",
  "workspaces:read",
  "teams:read",
  "users:read",
  "project_templates:read",
  "projects:read",
  "projects:write",
  "tasks:read",
  "tasks:write",
] as const;
