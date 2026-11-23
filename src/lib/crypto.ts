import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const KEY_LENGTH = 32;

export function parseEncryptionKey(value: string): Buffer {
  const trimmed = value.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }
  try {
    const asBase64 = Buffer.from(trimmed, "base64");
    if (asBase64.length === KEY_LENGTH) return asBase64;
  } catch {
    // fall through
  }
  throw new Error("Encryption key must be 32 bytes (64 hex characters or base64).");
}

export function randomUrlSafe(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function createPkcePair(): {
  verifier: string;
  challenge: string;
  method: "S256";
} {
  const verifier = randomUrlSafe(32);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge, method: "S256" };
}

export function encryptSecret(plainText: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${Buffer.concat([iv, tag, ciphertext]).toString("base64")}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  if (key.length !== KEY_LENGTH) {
    throw new Error("Encryption key must be 32 bytes.");
  }
  const raw = payload.startsWith("v1:") ? payload.slice(3) : payload;
  const buffer = Buffer.from(raw, "base64");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
