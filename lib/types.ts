export interface Expense {
  id: string;
  date: Date;
  amount: number;
  category: string;
  remark: string;
}

export interface Emi {
  id: string;
  name: string;
  monthly: number;
  tenure: number;
  total: number;
  startDate: Date | null;
  addedOn: Date | null;
}

/** One row of the sheet's "Investments" tab. */
export interface Investment {
  id: string;
  date: Date;
  amount: number;
  /** e.g. Mutual Fund, Stocks, PPF, Gold */
  type: string;
  /** One-time, Monthly, Quarterly, Half-yearly or Yearly (tidied from whatever the Shortcut sent) */
  frequency: string;
  paymentMethod: string;
  remark: string;
}

export interface Dataset {
  expenses: Expense[]; // sorted newest first
  emis: Emi[];
  investments: Investment[]; // sorted newest first
  syncedAt: Date;
}

/** Saved in the sheet's "Profile" tab. Only the name is required. */
export interface Profile {
  name: string;
  email?: string;
  monthlyIncome?: number;
  monthlyBudget?: number;
  /** day of the month the salary arrives (1–31) */
  payday?: number;
}

/** Non-secret settings the server shares with the browser */
export interface ClientConfig {
  currency: string;
  monthlyBudget: number | null;
  /** Pusher channel the Apps Script pings when the sheet changes; null when live updates aren't set up */
  realtime: RealtimeConfig | null;
}

/** Public Pusher settings. The secret stays in Apps Script. */
export interface RealtimeConfig {
  key: string;
  cluster: string;
  channel: string;
  /** Only for a self-hosted Pusher-compatible server (e.g. Soketi) */
  host?: string;
  port?: number;
}

/** Response of GET /api/data */
export type DataPayload =
  | {
      ok: true;
      demo: boolean;
      version: string;
      config: ClientConfig;
      /** signed-in username */
      user: string;
      /** included whenever the rows are */
      profile?: Profile | null;
      /** true when the client already has this version; the rows are omitted */
      unchanged?: boolean;
      generatedAt?: string;
      expenses?: ApiResponse["expenses"];
      emis?: ApiResponse["emis"];
      investments?: ApiResponse["investments"];
    }
  | { ok: false; error: string };

/** Shape returned by doGet in apps-script/Code.gs */
export interface ApiResponse {
  ok: boolean;
  error?: string;
  generatedAt?: string;
  expenses?: {
    row: number;
    date: string | null;
    amount: number | string;
    category: string;
    remark: string;
  }[];
  profile?: Record<string, unknown> | null;
  emis?: {
    row: number;
    addedOn: string | null;
    name: string;
    monthly: number | string;
    tenure: number | string;
    total: number | string;
    startDate: string | null;
  }[];
  /** only from the v3 script (with investments) */
  investments?: {
    row: number;
    date: string | null;
    amount: number | string;
    investmentType: string;
    frequency: string;
    paymentMethod: string;
    remark: string;
  }[];
}
