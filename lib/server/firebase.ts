import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { initializeFirestore, type Firestore } from "firebase-admin/firestore";
import { hostedConfig } from "./config";

// Kept on globalThis so dev-server reloads reuse one app (Firestore can only be initialised once per app).
const cache = globalThis as typeof globalThis & { __hisaboFirestore?: Firestore };

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const c = hostedConfig();
  if (!c) throw new Error("Firebase isn't configured.");
  return initializeApp({ credential: cert({ projectId: c.projectId, clientEmail: c.clientEmail, privateKey: c.privateKey }), projectId: c.projectId });
}

export const adminAuth = (): Auth => getAuth(app());

/** Server access to Firestore. REST instead of gRPC: faster cold starts on serverless. */
export function db(): Firestore {
  cache.__hisaboFirestore ??= initializeFirestore(app(), { preferRest: true });
  return cache.__hisaboFirestore;
}
