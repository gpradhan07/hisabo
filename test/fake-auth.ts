import type { AuthAdmin, AuthUser } from "@/lib/server/accounts";
import type { PhoneKeyDoc, PhoneKeyRepo } from "@/lib/server/phone-keys";
import type { UserDoc, UserRepo } from "@/lib/server/users";

/** In-memory Firebase Authentication with the same rules hisabo relies on (one user per Google account). */
export class FakeAuth implements AuthAdmin {
  readonly users = new Map<string, AuthUser>();
  private next = 1;

  add(user: Omit<AuthUser, "uid"> & { uid?: string }): AuthUser {
    const u = { ...user, uid: user.uid ?? `uid-${this.next++}` };
    this.users.set(u.uid, u);
    return u;
  }

  async byUid(uid: string) {
    return this.users.get(uid) ?? null;
  }
  async byGoogleSub(sub: string) {
    return [...this.users.values()].find((u) => u.googleSub === sub) ?? null;
  }
  async byEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email) ?? null;
  }
  async create(input: { email: string; emailVerified: boolean }) {
    if (await this.byEmail(input.email)) throw new Error("auth/email-already-exists");
    return this.add({ email: input.email, emailVerified: input.emailVerified, hasPassword: false });
  }
  async linkGoogle(uid: string, google: { sub: string }) {
    if (await this.byGoogleSub(google.sub)) throw new Error("auth/internal-error: FEDERATED_USER_ID_ALREADY_LINKED");
    const u = this.users.get(uid)!;
    if (u.googleSub) throw new Error("auth/internal-error: PROVIDER_ALREADY_LINKED");
    u.googleSub = google.sub;
  }
  async unlinkGoogle(uid: string) {
    delete this.users.get(uid)!.googleSub;
  }
  async takeOver(uid: string) {
    const u = this.users.get(uid)!;
    u.hasPassword = false;
    u.emailVerified = true;
  }
  async remove(uid: string) {
    this.users.delete(uid);
  }
}

export class MemoryUsers implements UserRepo {
  readonly docs = new Map<string, UserDoc>();
  async get(uid: string) {
    const d = this.docs.get(uid);
    return d ? { ...d } : null;
  }
  async save(uid: string, fields: Partial<UserDoc>) {
    this.docs.set(uid, { ...(this.docs.get(uid) ?? ({} as UserDoc)), ...fields, updatedAt: Date.now() });
  }
  async remove(uid: string) {
    this.docs.delete(uid);
  }
}

export class MemoryKeys implements PhoneKeyRepo {
  readonly docs = new Map<string, PhoneKeyDoc>();
  writes = 0;
  async create(id: string, doc: PhoneKeyDoc) {
    this.docs.set(id, { ...doc });
  }
  async get(id: string) {
    return this.docs.get(id) ?? null;
  }
  async listFor(uid: string) {
    return [...this.docs].filter(([, d]) => d.uid === uid).map(([id, d]) => ({ id, ...d }));
  }
  async update(id: string, fields: Partial<PhoneKeyDoc>) {
    this.writes++;
    Object.assign(this.docs.get(id)!, fields);
  }
  async remove(id: string) {
    this.docs.delete(id);
  }
}
