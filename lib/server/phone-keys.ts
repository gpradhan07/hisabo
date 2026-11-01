import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Phone keys let one iPhone's Shortcut add entries for one user. They're write-only (no route reads data
 * with them), revocable, and stored only as a SHA-256 hash: the document ID is the hash, so checking a
 * key is one read. The key itself is shown once, inside the setup code.
 */

export interface PhoneKeyDoc {
  uid: string;
  label: string;
  createdAt: number;
  lastUsedAt?: number;
  revokedAt?: number;
}

export type PhoneKeySummary = { id: string; label: string; createdAt: number; lastUsedAt?: number };

export interface PhoneKeyRepo {
  create(id: string, doc: PhoneKeyDoc): Promise<void>;
  get(id: string): Promise<PhoneKeyDoc | null>;
  listFor(uid: string): Promise<(PhoneKeyDoc & { id: string })[]>;
  update(id: string, fields: Partial<PhoneKeyDoc>): Promise<void>;
  remove(id: string): Promise<void>;
}

export function firestorePhoneKeys(db: Firestore): PhoneKeyRepo {
  const col = db.collection("phoneKeys");
  return {
    async create(id, doc) {
      await col.doc(id).create(doc);
    },
    async get(id) {
      const snap = await col.doc(id).get();
      return snap.exists ? (snap.data() as PhoneKeyDoc) : null;
    },
    async listFor(uid) {
      // Equality only, so Firestore's automatic index covers it; sorted here.
      const snap = await col.where("uid", "==", uid).get();
      return snap.docs.map((d) => ({ id: d.id, ...(d.data() as PhoneKeyDoc) }));
    },
    async update(id, fields) {
      await col.doc(id).update(fields);
    },
    async remove(id) {
      await col.doc(id).delete();
    },
  };
}

export const MAX_ACTIVE_KEYS = 10;
const KEY_RE = /^hk_[A-Za-z0-9_-]{43}$/;
const USE_WRITE_EVERY_MS = 60 * 60_000; // lastUsedAt at most hourly, to save Firestore writes

export const keyId = (key: string) => createHash("sha256").update(key).digest("hex");

/** A new key: "hk_" + 32 random bytes. */
export function newPhoneKey() {
  const key = `hk_${randomBytes(32).toString("base64url")}`;
  return { key, id: keyId(key) };
}

/** What the QR code and the "Pair this iPhone" link carry. The Shortcut saves it as setup.txt. */
export const setupCode = (appUrl: string, key: string) => JSON.stringify({ url: `${appUrl}/api/ingest`, key });

/** The user a key belongs to, or null when it's malformed, unknown or revoked. */
export async function resolvePhoneKey(repo: PhoneKeyRepo, key: string, now = Date.now()): Promise<{ id: string; uid: string } | null> {
  if (!KEY_RE.test(key)) return null;
  const id = keyId(key);
  const doc = await repo.get(id);
  if (!doc || doc.revokedAt) return null;
  if (!doc.lastUsedAt || now - doc.lastUsedAt > USE_WRITE_EVERY_MS) await repo.update(id, { lastUsedAt: now });
  return { id, uid: doc.uid };
}

/** The user's working keys, newest first, without anything secret. */
export async function activeKeys(repo: PhoneKeyRepo, uid: string): Promise<PhoneKeySummary[]> {
  return (await repo.listFor(uid))
    .filter((k) => !k.revokedAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(({ id, label, createdAt, lastUsedAt }) => ({ id, label, createdAt, ...(lastUsedAt ? { lastUsedAt } : {}) }));
}

/** Revokes one of the user's own keys. False when it isn't theirs. */
export async function revokeKey(repo: PhoneKeyRepo, uid: string, id: string, now = Date.now()): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(id)) return false;
  const doc = await repo.get(id);
  if (!doc || doc.uid !== uid) return false;
  if (!doc.revokedAt) await repo.update(id, { revokedAt: now });
  return true;
}
