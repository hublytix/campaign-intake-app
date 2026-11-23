import { describe, expect, it } from "vitest";
import {
  createPkcePair,
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
  randomUrlSafe,
} from "./crypto";

const key = parseEncryptionKey("a".repeat(64));

describe("parseEncryptionKey", () => {
  it("accepts a 32-byte hex key and rejects short keys", () => {
    expect(parseEncryptionKey("ab".repeat(32)).length).toBe(32);
    expect(() => parseEncryptionKey("tooshort")).toThrow(/32 bytes/i);
  });
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a token and produces different ciphertexts", () => {
    const first = encryptSecret("asana-refresh-token", key);
    const second = encryptSecret("asana-refresh-token", key);
    expect(first).not.toBe(second);
    expect(decryptSecret(first, key)).toBe("asana-refresh-token");
    expect(decryptSecret(second, key)).toBe("asana-refresh-token");
  });

  it("fails to decrypt with the wrong key", () => {
    const payload = encryptSecret("asana-refresh-token", key);
    const other = parseEncryptionKey("b".repeat(64));
    expect(() => decryptSecret(payload, other)).toThrow();
  });
});

describe("randomUrlSafe and PKCE", () => {
  it("creates an unguessable state and an S256 PKCE pair", () => {
    const state = randomUrlSafe(32);
    expect(state).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(state.length).toBeGreaterThanOrEqual(40);
    const pkce = createPkcePair();
    expect(pkce.verifier).not.toBe(pkce.challenge);
    expect(pkce.method).toBe("S256");
  });
});
