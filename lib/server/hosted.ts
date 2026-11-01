import "server-only";
import { firebaseAuthAdmin } from "./accounts";
import type { HostedConfig } from "./config";
import { adminAuth, db } from "./firebase";
import { firestoreSignals } from "./live";
import { firestorePhoneKeys } from "./phone-keys";
import { firestoreUsers } from "./users";

/** The real Firebase-backed services for hosted mode (tests pass fakes instead). */
export function hostedServices(config: HostedConfig) {
  return {
    config,
    admin: firebaseAuthAdmin(adminAuth()),
    users: firestoreUsers(db()),
    phoneKeys: firestorePhoneKeys(db()),
    signals: firestoreSignals(db()),
  };
}

export const OAUTH_COOKIE = "hisabo_oauth";
