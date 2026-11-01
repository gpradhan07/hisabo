import "server-only";
import type { Firestore } from "firebase-admin/firestore";

/**
 * Live updates (hosted mode). After every change to a user's sheet the server bumps `signals/{uid}`: a timestamp,
 * nothing else. An open dashboard listens to its own signal (firestore.rules lets each user read only theirs) and
 * reloads when it changes, so nothing polls. Edits typed straight into the Google Sheet send no signal.
 */
export interface LiveSignals {
  notify(uid: string): Promise<void>;
  remove(uid: string): Promise<void>;
}

export function firestoreSignals(db: Firestore): LiveSignals {
  const ref = (uid: string) => db.collection("signals").doc(uid);
  return {
    async notify(uid) {
      await ref(uid).set({ at: Date.now() });
    },
    async remove(uid) {
      await ref(uid).delete();
    },
  };
}

/** Best effort: the sheet is already written, and a missed signal only means the change shows on the next refresh. */
export async function signalChange(signals: LiveSignals, uid: string) {
  try {
    await signals.notify(uid);
  } catch {
    // Firestore unreachable: nothing to undo
  }
}
