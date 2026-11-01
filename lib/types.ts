export interface Expense {
  id: string;
  date: Date;
  amount: number;
  category: string;
  remark: string;
  /** where the money went (Swiggy, Amazon); a subscription payment carries the service's name */
  merchant?: string;
  /** how it was paid, as the Shortcut sends it ("UPI (Credit Card)", "Cash"…) */
  paymentMethod?: string;
  /** the credit card, when it was paid by card ("Kotak CC") */
  cardName?: string;
}

export interface Emi {
  id: string;
  name: string;
  monthly: number;
  tenure: number;
  total: number;
  startDate: Date | null;
  addedOn: Date | null;
  /** Credit Card EMI, Bank Loan, BNPL, Other */
  type: string;
  /** instalments already paid before it was added to hisabo */
  paidBefore: number;
  remark: string;
}

/** One row of the "EMI Payments" tab: a monthly instalment recorded from the Shortcut. */
export interface EmiPayment {
  id: string;
  date: Date;
  /** matches an EMI's name */
  emiName: string;
  amount: number;
  paymentMethod: string;
  cardName: string;
  remark: string;
}

/** One payment from the "Subscriptions" tab (Netflix, Spotify, a gym…). */
export interface Subscription {
  id: string;
  date: Date;
  amount: number;
  name: string;
  /** Weekly, Monthly, Quarterly, Half-yearly, Yearly or One-time */
  frequency: string;
  autoRenew: boolean;
  paymentMethod: string;
  cardName: string;
  remark: string;
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
  /** e.g. Nifty 50 Index Fund */
  name: string;
  /** where it's held: Groww, Zerodha, a bank… */
  platform: string;
  /** set on a plan's latest entry by "Stop SIP": no automatic instalments from this date */
  stoppedOn?: Date | null;
  /** an instalment hisabo counts by itself (not in the sheet); see withAutoInstalments */
  auto?: boolean;
  /** the plan it belongs to, numbered when two plans share a name ("Post office 2"); see withAutoInstalments */
  planName?: string;
  /** the credit card, when paid with one */
  cardName: string;
}

export interface Dataset {
  /** sorted newest first; includes subscription payments (category "Subscriptions") so they count as spending */
  expenses: Expense[];
  subscriptions: Subscription[]; // sorted newest first
  emis: Emi[];
  emiPayments: EmiPayment[]; // sorted newest first
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
  /** hosted mode: per-user accounts, phone pairing (Add to iPhone) */
  hosted: boolean;
  monthlyBudget: number | null;
  /** Pusher channel the Apps Script pings when the sheet changes; null when live updates aren't set up */
  realtime: RealtimeConfig | null;
  /** hosted mode: the Firebase project the dashboard listens to for changes (public values; see lib/server/live.ts) */
  live?: { apiKey: string; projectId: string } | null;
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
      /** signed-in username (self-host) or email (hosted) */
      user: string;
      /** hosted: the Google account whose Drive holds the spreadsheet */
      sheetOwner?: string;
      /** hosted: the user's spreadsheet in Google Sheets */
      sheetUrl?: string;
      /** included whenever the rows are */
      profile?: Profile | null;
      /** true when the client already has this version; the rows are omitted */
      unchanged?: boolean;
      generatedAt?: string;
      expenses?: ApiResponse["expenses"];
      subscriptions?: ApiResponse["subscriptions"];
      emis?: ApiResponse["emis"];
      emiPayments?: ApiResponse["emiPayments"];
      investments?: ApiResponse["investments"];
    }
  | { ok: false; error: string; /** hosted: Google Drive must be (re)connected */ code?: "connect-drive" };

/** Shape returned by doGet in apps-script/Code.gs (and by the Google Sheets store, row for row) */
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
    paymentMethod?: string;
    cardName?: string;
    merchant?: string;
  }[];
  /** only from the v4 script */
  subscriptions?: {
    row: number;
    date: string | null;
    amount: number | string;
    name: string;
    frequency: string;
    autoRenew: string;
    paymentMethod: string;
    cardName: string;
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
    paymentMethod?: string;
    cardName?: string;
    emiType?: string;
    paidBefore?: number | string;
    remark?: string;
  }[];
  /** only from the v4 script */
  emiPayments?: {
    row: number;
    date: string | null;
    emiName: string;
    amount: number | string;
    paymentMethod: string;
    cardName: string;
    remark: string;
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
    investmentName?: string;
    platform?: string;
    cardName?: string;
    stoppedOn?: string | null;
  }[];
}
