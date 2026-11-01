import type { NewEntry, Store } from "./types";

const ADD_MESSAGE: Record<NewEntry["kind"], string> = {
  expense: "This is demo data. Connect your Google Sheet to add expenses.",
  subscription: "This is demo data. Connect your Google Sheet to add subscriptions.",
  emi: "This is demo data. Connect your Google Sheet to add EMIs.",
  emiPayment: "This is demo data. Connect your Google Sheet to record EMI payments.",
  investment: "This is demo data. Connect your Google Sheet to add investments.",
};

/** No sheet configured yet: the client renders built-in demo data and keeps edits on the device. */
export const demoStore: Store = {
  async load() {
    return { ok: true, demo: true, version: "demo", generatedAt: new Date().toISOString(), expenses: [], subscriptions: [], emis: [], emiPayments: [], investments: [], profile: null };
  },
  async append(entry) {
    return { ok: false, demo: true, error: ADD_MESSAGE[entry.kind] };
  },
  async saveProfile() {
    return { ok: false, demo: true, error: "Demo mode: saved on this device only." };
  },
  async remove() {
    return { ok: false, demo: true, error: "This is demo data. Connect your Google Sheet to delete entries." };
  },
  async update() {
    return { ok: false, demo: true, error: "This is demo data. Connect your Google Sheet to edit entries." };
  },
  async stopInvestment() {
    return { ok: false, demo: true, error: "This is demo data. Connect your Google Sheet to stop a SIP." };
  },
};
