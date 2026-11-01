"use client";

import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { toDataset } from "@/lib/api";
import { demoDataset } from "@/lib/demo";
import { makeFormatters, type Formatters } from "@/lib/format";
import { useTicker } from "@/lib/hooks";
import { PERIODS, getRange, type PeriodId, type Range } from "@/lib/periods";
import {
  addEmi as addEmiAction,
  addExpense as addExpenseAction,
  addInvestment as addInvestmentAction,
  saveProfile as saveProfileAction,
  updateExpense as updateExpenseAction,
} from "@/app/(dashboard)/actions";
import { validateEmi, type EmiErrors, type EmiInput } from "@/lib/emi-input";
import { validateInvestment, type InvestmentErrors, type InvestmentInput } from "@/lib/investment-input";
import { validateExpense, type ExpenseErrors, type ExpenseInput } from "@/lib/expense-input";
import { normalizeProfile, validateProfile, type ProfileErrors, type ProfileInput } from "@/lib/profile";
import { CACHE_KEY, PROMPTED_KEY } from "@/lib/local-data";
import type { ClientConfig, DataPayload, Dataset, Expense, Profile, RealtimeConfig } from "@/lib/types";
import type Pusher from "pusher-js";

type Theme = "light" | "dark";
type Status = "loading" | "live" | "error";
/** Connection to the Pusher channel that Apps Script pings when the sheet changes */
export type LiveState = "off" | "connecting" | "connected" | "unavailable";

interface DataContextValue {
  data: Dataset | null;
  demo: boolean;
  config: ClientConfig;
  fmt: Formatters;
  status: Status;
  live: LiveState;
  error: string | null;
  checkedAt: Date | null;
  refreshing: boolean;
  refresh: () => void;
  /** expenses that arrived since the page was opened (highlighted for a few seconds) */
  freshIds: ReadonlySet<string>;
  user: string | null;
  /** hosted mode: the Google account whose Drive holds the spreadsheet */
  sheetOwner: string | null;
  /** hosted mode: the user's spreadsheet in Google Sheets */
  sheetUrl: string | null;
  /** your name and optional details, from the sheet's Profile tab */
  profile: Profile | null;
  saveProfile: (input: ProfileInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: ProfileErrors }>;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  /** monthly budget: the one in your profile, else MONTHLY_BUDGET from the environment */
  budget: number | null;
  /** "Add expense" form (manual, any past date) */
  addExpense: (input: ExpenseInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: ExpenseErrors }>;
  addOpen: boolean;
  setAddOpen: (open: boolean) => void;
  /** the expense open in the form for editing (the same dialog as "Add expense") */
  editing: Expense | null;
  setEditing: (expense: Expense | null) => void;
  updateExpense: (original: Expense, input: ExpenseInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: ExpenseErrors }>;
  addInvestment: (input: InvestmentInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: InvestmentErrors }>;
  investOpen: boolean;
  setInvestOpen: (open: boolean) => void;
  addEmi: (input: EmiInput) => Promise<{ ok: true } | { ok: false; error: string; fieldErrors?: EmiErrors }>;
  emiOpen: boolean;
  setEmiOpen: (open: boolean) => void;
  now: Date;
  period: PeriodId;
  setPeriod: (p: PeriodId) => void;
  range: Range;
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** privacy mode: amounts are hidden until you tap the eye */
  amountsHidden: boolean;
  setAmountsHidden: (hidden: boolean) => void;
  /** flip privacy mode */
  toggleAmounts: () => void;
}

const DataContext = createContext<DataContextValue | null>(null);

export function useDashboard() {
  const ctx = use(DataContext);
  if (!ctx) throw new Error("useDashboard must be used inside <DataProvider>");
  return ctx;
}

const DEFAULT_CONFIG: ClientConfig = { currency: "INR", hosted: false, monthlyBudget: null, realtime: null };
const DEMO_PROFILE_KEY = "hisabo:demo-profile";

const store = {
  get(key: string) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      // storage blocked — fine, it's only a convenience
    }
  },
};

const expenseKey = (e: Expense) => `${e.date.getTime()}|${e.amount}|${e.category}|${e.remark}`;
/** The sheet's rows from an /api/data reply (or its cached copy), for toDataset. */
const sheetRows = (json: Extract<DataPayload, { ok: true }>) => ({
  expenses: json.expenses,
  subscriptions: json.subscriptions,
  emis: json.emis,
  emiPayments: json.emiPayments,
  investments: json.investments,
  generatedAt: json.generatedAt,
});

const manualSig = (amount: number, category: string, remark: string) => `${amount}|${category.trim().toLowerCase()}|${remark.trim()}`;

export function DataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Dataset | null>(null);
  const [demo, setDemo] = useState(false);
  const [config, setConfig] = useState<ClientConfig>(DEFAULT_CONFIG);
  const [status, setStatus] = useState<Status>("loading");
  const [socket, setSocket] = useState<Exclude<LiveState, "off">>("connecting");
  const [signal, setSignal] = useState<Exclude<LiveState, "off">>("connecting");
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(new Set());
  const [user, setUser] = useState<string | null>(null);
  const [sheetOwner, setSheetOwner] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [investOpen, setInvestOpen] = useState(false);
  const [emiOpen, setEmiOpen] = useState(false);
  const [period, setPeriodState] = useState<PeriodId>("this-month");
  const [theme, setThemeState] = useState<Theme>("dark");
  // Hidden by default every time the app opens; revealing lasts for this browser session only.
  const [amountsHidden, setAmountsHiddenState] = useState(true);
  const amountsHiddenRef = useRef(true);
  const now = useTicker(30_000);
  const router = useRouter();

  const version = useRef<string | null>(null);
  const knownKeys = useRef<Set<string> | null>(null);
  const inflight = useRef(false);
  /** expenses just added from this dashboard: they get their own toast, so skip the "new expense" one */
  const addedHere = useRef(new Map<string, number>());

  /** Ask for a name once per browser session when there isn't one yet. */
  const promptIfNoName = useCallback((p: Profile | null) => {
    if (p) return;
    try {
      if (sessionStorage.getItem(PROMPTED_KEY)) return;
      sessionStorage.setItem(PROMPTED_KEY, "1");
    } catch {
      // storage blocked — still fine to prompt
    }
    setProfileOpen(true);
  }, []);

  const accept = useCallback(
    (next: Dataset, announce: boolean) => {
      const keys = new Set(next.expenses.map(expenseKey));
      if (announce && knownKeys.current) {
        const known = knownKeys.current;
        const added = next.expenses.filter((e) => !known.has(expenseKey(e)));
        if (added.length) {
          setFreshIds(new Set(added.map((e) => e.id)));
          setTimeout(() => setFreshIds(new Set()), 8000);
          const fmt = makeFormatters(config.currency, amountsHiddenRef.current);
          const fromShortcut = added.filter((e) => {
            const sig = manualSig(e.amount, e.category, e.remark);
            if (!addedHere.current.has(sig)) return true;
            addedHere.current.delete(sig);
            return false;
          });
          for (const e of fromShortcut.slice(0, 3)) {
            toast.success(`New expense · ${fmt.moneyExact(e.amount)}`, {
              description: [e.category, e.merchant, e.remark].filter(Boolean).join(" · "),
            });
          }
        }
      }
      knownKeys.current = keys;
      setData(next);
    },
    [config.currency],
  );

  const load = useCallback(
    async (manual = false) => {
      if (inflight.current) return;
      inflight.current = true;
      if (manual) setRefreshing(true);
      try {
        const res = await fetch("/api/data", {
          cache: "no-store",
          headers: version.current ? { "x-data-version": version.current } : undefined,
        });
        if (res.status === 401) {
          router.replace("/login");
          return;
        }
        // Hosted mode: Google Drive access is gone (or setup isn't finished).
        if (res.status === 409) {
          router.replace("/connect-drive");
          return;
        }
        const json = (await res.json()) as DataPayload;
        if (!json.ok) throw new Error(json.error);

        setConfig(json.config);
        setDemo(json.demo);
        setUser(json.user);
        setSheetOwner(json.sheetOwner ?? null);
        setSheetUrl(json.sheetUrl ?? null);
        if (!json.unchanged) {
          version.current = json.version;
          let nextProfile: Profile | null;
          if (json.demo) {
            accept(demoDataset(), false);
            store.set(CACHE_KEY, null);
            nextProfile = normalizeProfile(JSON.parse(store.get(DEMO_PROFILE_KEY) ?? "null"));
          } else {
            accept(toDataset({ ok: true, ...sheetRows(json) }), true);
            store.set(CACHE_KEY, JSON.stringify(json));
            nextProfile = json.profile ?? null;
          }
          setProfile(nextProfile);
          promptIfNoName(nextProfile);
        }
        setCheckedAt(new Date());
        setError(null);
        setStatus("live");
      } catch (err) {
        setError((err as Error).message || "Couldn't load your sheet.");
        setStatus("error");
      } finally {
        inflight.current = false;
        setRefreshing(false);
      }
    },
    [accept, router, promptIfNoName],
  );

  /** A write failed because Google Drive access is gone: send the user to reconnect it. */
  const reconnectIfNeeded = useCallback(
    <T extends { code?: string }>(res: T): T => {
      if (res.code === "connect-drive") router.replace("/connect-drive");
      return res;
    },
    [router],
  );

  const addExpense = useCallback<DataContextValue["addExpense"]>(
    async (input) => {
      const checked = validateExpense(input);
      if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
      const res = await addExpenseAction(input);
      if (!res.ok) return reconnectIfNeeded(res);
      const e = checked.expense;
      addedHere.current.set(manualSig(e.amount, e.category, e.remark), Date.now());
      // Pusher will also ping, but reload now in case live updates aren't set up.
      void load();
      return { ok: true };
    },
    [load, reconnectIfNeeded],
  );

  const updateExpense = useCallback<DataContextValue["updateExpense"]>(
    async (original, input) => {
      const checked = validateExpense(input);
      if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
      const res = await updateExpenseAction({ id: original.id, date: original.date.toISOString(), amount: original.amount }, input);
      if (!res.ok) return reconnectIfNeeded(res);
      // The edited row comes back looking new; it has its own toast, so skip the "new expense" one.
      const e = checked.expense;
      addedHere.current.set(manualSig(e.amount, e.category, e.remark), Date.now());
      void load();
      return { ok: true };
    },
    [load, reconnectIfNeeded],
  );

  const addInvestment = useCallback<DataContextValue["addInvestment"]>(
    async (input) => {
      const checked = validateInvestment(input);
      if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
      const res = await addInvestmentAction(input);
      if (!res.ok) return reconnectIfNeeded(res);
      void load();
      return { ok: true };
    },
    [load, reconnectIfNeeded],
  );

  const addEmi = useCallback<DataContextValue["addEmi"]>(
    async (input) => {
      const checked = validateEmi(input);
      if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
      const res = await addEmiAction(input);
      if (!res.ok) return reconnectIfNeeded(res);
      void load();
      return { ok: true };
    },
    [load, reconnectIfNeeded],
  );

  const saveProfile = useCallback<DataContextValue["saveProfile"]>(
    async (input) => {
      const checked = validateProfile(input);
      if (!checked.ok) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: checked.errors };
      if (demo) {
        // Nothing to write to in demo mode, so keep it on this device.
        store.set(DEMO_PROFILE_KEY, JSON.stringify(checked.profile));
        setProfile(checked.profile);
        return { ok: true };
      }
      const res = await saveProfileAction(input);
      if (!res.ok) return reconnectIfNeeded(res);
      setProfile(res.profile);
      return { ok: true };
    },
    [demo, reconnectIfNeeded],
  );

  // First paint: restore preferences + the last copy of the sheet, then fetch fresh data.
  useEffect(() => {
    // Browser storage only exists after hydration, so restoring it has to happen in an effect.
    const savedPeriod = store.get("hisabo:period");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (PERIODS.some((p) => p.id === savedPeriod)) setPeriodState(savedPeriod as PeriodId);
    if (store.get("hisabo:theme") === "light") setThemeState("light");
    try {
      if (sessionStorage.getItem("hisabo:show-amounts") === "1") {
        amountsHiddenRef.current = false;
        setAmountsHiddenState(false);
      }
    } catch {
      // storage blocked: stay hidden
    }

    try {
      const cached = store.get(CACHE_KEY);
      if (cached) {
        const json = JSON.parse(cached) as Extract<DataPayload, { ok: true }>;
        version.current = json.version;
        setConfig(json.config);
        setUser(json.user ?? null);
        setSheetOwner(json.sheetOwner ?? null);
        setSheetUrl(json.sheetUrl ?? null);
        setProfile(json.profile ?? null);
        accept(toDataset({ ok: true, ...sheetRows(json) }), false);
      }
    } catch {
      store.set(CACHE_KEY, null);
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Live updates: no timer. Apps Script pings our Pusher channel when the sheet changes,
  // and only then do we reload. (A JSON string keeps the effect from re-running on every fetch.)
  const realtimeJson = config.realtime ? JSON.stringify(config.realtime) : null;
  useEffect(() => {
    if (!realtimeJson) return;
    const rt = JSON.parse(realtimeJson) as RealtimeConfig;
    let cancelled = false;
    let client: Pusher | null = null;
    let burst: ReturnType<typeof setTimeout> | undefined;

    void import("pusher-js").then(({ default: PusherClient }) => {
      if (cancelled) return;
      client = new PusherClient(rt.key, {
        cluster: rt.cluster,
        // Only used with a self-hosted Pusher-compatible server (e.g. Soketi)
        ...(rt.host ? { wsHost: rt.host, wsPort: rt.port ?? 6001, wssPort: rt.port ?? 6001, forceTLS: false, enabledTransports: ["ws", "wss"] } : {}),
      });
      let connectedBefore = false;
      client.connection.bind("state_change", ({ current }: { current: string }) => {
        setSocket(current === "connected" ? "connected" : current === "connecting" || current === "initialized" ? "connecting" : "unavailable");
        if (current !== "connected") return;
        // After a dropped connection, catch up on anything we missed (the first connect needs nothing).
        if (connectedBefore) void load();
        connectedBefore = true;
      });
      client.subscribe(rt.channel).bind("sheet-updated", () => {
        clearTimeout(burst);
        burst = setTimeout(() => void load(), 250); // several quick edits → one reload
      });
    });

    return () => {
      cancelled = true;
      clearTimeout(burst);
      client?.disconnect();
    };
  }, [realtimeJson, load]);

  // Hosted mode: no timer. After every change the server bumps this user's signal in Firestore (lib/server/live.ts);
  // listening to it, the dashboard reloads only when something was saved. The first snapshot also catches anything
  // saved while the page loaded. Firebase is loaded only here, and keeps its sign-in in memory (never on disk).
  const liveJson = config.live && !demo ? JSON.stringify(config.live) : null;
  useEffect(() => {
    if (!liveJson) return;
    const { apiKey, projectId } = JSON.parse(liveJson) as NonNullable<ClientConfig["live"]>;
    let cancelled = false;
    let stop: (() => void) | undefined;
    let burst: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        const res = await fetch("/api/live-token", { method: "POST", cache: "no-store" });
        if (!res.ok) throw new Error(`live token ${res.status}`);
        const { uid, token } = (await res.json()) as { uid: string; token: string };
        const [{ getApps, initializeApp }, { getAuth, inMemoryPersistence, setPersistence, signInWithCustomToken }, { doc, getFirestore, onSnapshot }] =
          await Promise.all([import("firebase/app"), import("firebase/auth"), import("firebase/firestore")]);
        if (cancelled) return;
        const app = getApps().find((a) => a.name === "hisabo-live") ?? initializeApp({ apiKey, projectId }, "hisabo-live");
        const auth = getAuth(app);
        await setPersistence(auth, inMemoryPersistence);
        await signInWithCustomToken(auth, token);
        if (cancelled) return;
        // undefined until the first answer from the server; then the signal's time (null before anything was saved)
        let seen: number | null | undefined;
        stop = onSnapshot(
          doc(getFirestore(app), "signals", uid),
          { includeMetadataChanges: true },
          (snap) => {
            // From the local cache (offline, or reconnecting): wait for the server's answer
            if (snap.metadata.fromCache) return setSignal("connecting");
            setSignal("connected");
            const at = (snap.data()?.at as number | undefined) ?? null;
            if (seen !== undefined && at === seen) return;
            const first = seen === undefined;
            seen = at;
            clearTimeout(burst);
            burst = setTimeout(() => void load(), first ? 0 : 250); // several quick saves → one reload
          },
          () => setSignal("unavailable"),
        );
      } catch {
        if (!cancelled) setSignal("unavailable");
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(burst);
      stop?.();
    };
  }, [liveJson, load]);

  // Phones pause background tabs (and their live connection), so check once when the dashboard comes back into view.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    store.set("hisabo:theme", t === "light" ? "light" : null);
  }, []);
  const setPeriod = useCallback((p: PeriodId) => {
    setPeriodState(p);
    store.set("hisabo:period", p);
  }, []);

  const setAmountsHidden = useCallback((hidden: boolean) => {
    amountsHiddenRef.current = hidden;
    setAmountsHiddenState(hidden);
    try {
      if (hidden) sessionStorage.removeItem("hisabo:show-amounts");
      else sessionStorage.setItem("hisabo:show-amounts", "1");
    } catch {
      // storage blocked: still works for this page
    }
  }, []);
  // Privacy toggle: amounts switch between "₹••••" and the real value instantly.
  const toggleAmounts = useCallback(() => setAmountsHidden(!amountsHiddenRef.current), [setAmountsHidden]);
  const fmt = useMemo(() => makeFormatters(config.currency, amountsHidden), [config.currency, amountsHidden]);
  const earliest = data?.expenses.at(-1)?.date ?? null;
  const range = useMemo(() => getRange(period, now, earliest), [period, now, earliest]);
  const refresh = useCallback(() => void load(true), [load]);

  const value: DataContextValue = {
    data,
    demo,
    config,
    fmt,
    status,
    // Hosted: polling; a failed read shows as "Offline" through `status`.
    live: config.realtime ? socket : config.live ? signal : "off",
    error,
    checkedAt,
    refreshing,
    refresh,
    freshIds,
    user,
    sheetOwner,
    sheetUrl,
    profile,
    saveProfile,
    profileOpen,
    setProfileOpen,
    budget: profile?.monthlyBudget ?? config.monthlyBudget,
    addExpense,
    addOpen,
    setAddOpen,
    editing,
    setEditing,
    updateExpense,
    addInvestment,
    investOpen,
    setInvestOpen,
    addEmi,
    emiOpen,
    setEmiOpen,
    now,
    period,
    setPeriod,
    range,
    theme,
    setTheme,
    amountsHidden,
    setAmountsHidden,
    toggleAmounts,
  };

  return <DataContext value={value}>{children}</DataContext>;
}
