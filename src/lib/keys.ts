import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { inspectEnv, resolveAppMode } from "./config";
import { parseEncryptionKey } from "./crypto";

function dataDir(): string {
  return path.dirname(
    process.env.DATABASE_PATH || path.join(process.cwd(), "data", "app.sqlite"),
  );
}

function writeSecretFile(filePath: string, value: string): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, value, { encoding: "utf8", mode: 0o600 });
}

function randomHexKey(): string {
  return randomBytes(32).toString("hex");
}

export function getSessionKey(
  env: Record<string, string | undefined> = process.env,
): Buffer {
  const mode = resolveAppMode(env);
  const sessionSecret = (env.SESSION_SECRET ?? "").trim();

  if (mode === "real") {
    return parseEncryptionKey(sessionSecret);
  }

  if (mode === "misconfigured") {
    if (sessionSecret) return parseEncryptionKey(sessionSecret);
    if (!globalThis.__ciaEphemeralSessionKey) {
      globalThis.__ciaEphemeralSessionKey = parseEncryptionKey(randomHexKey());
    }
    return globalThis.__ciaEphemeralSessionKey;
  }

  const demoPath = path.join(dataDir(), ".demo-session-key");
  if (existsSync(demoPath)) {
    return parseEncryptionKey(readFileSync(demoPath, "utf8").trim());
  }
  const generated = randomHexKey();
  writeSecretFile(demoPath, generated);
  return parseEncryptionKey(generated);
}

export function getTokenKey(
  env: Record<string, string | undefined> = process.env,
): Buffer {
  const inspection = inspectEnv(env);
  if (inspection.mode !== "real") {
    throw new Error("Token encryption is only available in real mode.");
  }
  return parseEncryptionKey((env.TOKEN_ENCRYPTION_KEY ?? "").trim());
}

declare global {
  var __ciaEphemeralSessionKey: Buffer | undefined;
}
