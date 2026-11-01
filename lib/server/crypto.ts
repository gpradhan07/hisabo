import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for the Google tokens stored in Firestore. Format: "v1." + base64url(iv | ciphertext | tag).
 * The key is TOKEN_ENCRYPTION_KEY (32 random bytes, base64); rotating it means re-encrypting stored tokens.
 */

function keyBytes(key: string): Buffer {
  const bytes = Buffer.from(key, "base64");
  if (bytes.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32).");
  return bytes;
}

export function encrypt(plain: string, key: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `v1.${Buffer.concat([iv, body, cipher.getAuthTag()]).toString("base64url")}`;
}

/** Throws if the value was tampered with or encrypted with another key. */
export function decrypt(sealed: string, key: string): string {
  if (!sealed.startsWith("v1.")) throw new Error("Unknown token format.");
  const raw = Buffer.from(sealed.slice(3), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(key), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(raw.length - 16));
  return Buffer.concat([decipher.update(raw.subarray(12, raw.length - 16)), decipher.final()]).toString("utf8");
}
