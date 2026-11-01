"use client";

import { BarChart3, ChevronRight, Landmark, LayoutDashboard, Moon, Plus, ReceiptText, RefreshCw, Repeat, Smartphone, Sun, TrendingUp } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useTransition, type CSSProperties, type ReactNode } from "react";
import { logout } from "@/app/login/actions";
import { forgetCachedData } from "@/lib/local-data";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hisaboIconSvg } from "@/lib/hisabo-icon";
import { useTicker } from "@/lib/hooks";
import { initial } from "@/lib/profile";
import { cn } from "@/lib/utils";
import { useDashboard } from "./data-provider";
import { AddExpenseDialog } from "./add-expense-dialog";
import { AddEmiDialog } from "./add-emi-dialog";
import { AddInvestmentDialog } from "./add-investment-dialog";
import { PrivacyToggle } from "./privacy-toggle";
import { ProfileDialog } from "./profile-dialog";

const NAV = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/transactions", label: "Transactions", short: "Expenses", icon: ReceiptText },
  { href: "/investments", label: "Investments", short: "Invest", icon: TrendingUp },
  { href: "/subscriptions", label: "Subscriptions", short: "Subs", icon: Repeat },
  { href: "/emis", label: "EMIs", icon: Landmark },
];

/** Hosted mode only; kept out of the phone tab bar (on phones it's in the profile dialog). */
const SETUP_NAV = [{ href: "/add-to-iphone", label: "Add to iPhone", icon: Smartphone }];

/** The app's name as a wordmark: "hisabo." with the dot in the brand mint. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("font-semibold tracking-tight", className)}>
      hisabo<span className="text-brand">.</span>
    </span>
  );
}

/**
 * The hisabo icon (mint money bag with ₹), drawn inline from the same SVG as the favicon and
 * home-screen icons, so it's sharp at any size. When animated, it gives one jingle on hover (see globals.css).
 */
export function Logo({ className, animated = true }: { className?: string; animated?: boolean }) {
  // Unique gradient ids per instance (the sidebar and phone header both render a logo).
  const prefix = `hl${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  return (
    <span
      className={cn("block shrink-0 [&>svg]:size-full", animated && "icon-animated", className)}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: hisaboIconSvg({ prefix, variant: "plain" }) }}
    />
  );
}

function useActive() {
  const pathname = usePathname();
  return (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
}

export function AppShell({ children }: { children: ReactNode }) {
  const { theme } = useDashboard();
  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as CSSProperties}>
        <AppSidebar />
        <SidebarInset className="min-w-0">
          <SiteHeader />
          <div className="flex-1 px-4 pt-5 pb-40 sm:px-6 md:pb-10 lg:px-8 lg:pt-7">
            <div className="mx-auto max-w-7xl">{children}</div>
          </div>
        </SidebarInset>
        <MobileTabBar />
        <AddButtonMobile />
      </SidebarProvider>
      <ProfileDialog />
      <AddExpenseDialog />
      <AddInvestmentDialog />
      <AddEmiDialog />
      {/* toasts drop in at the top centre; on an iPhone home-screen app they stay clear of the notch */}
      <Toaster theme={theme} position="top-center" offset={{ top: 16 }} mobileOffset={{ top: "calc(env(safe-area-inset-top) + 8px)" }} />
    </TooltipProvider>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────

function AppSidebar() {
  const active = useActive();
  const { config } = useDashboard();
  return (
    <Sidebar variant="sidebar" collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/">
                <Logo className="size-9 shrink-0" />
                <div className="grid flex-1 text-left leading-tight">
                  <Wordmark className="truncate text-[17px] leading-tight" />
                  <span className="truncate text-[11px] text-muted-foreground">Har rupaye ka hisaab.</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem className="mt-2">
            <SidebarAddButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {NAV.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    asChild
                    isActive={active(href)}
                    tooltip={label}
                    className="h-10 text-[14px] data-[active=true]:bg-brand-soft data-[active=true]:font-semibold data-[active=true]:text-brand-ink"
                  >
                    <Link href={href}>
                      <Icon />
                      <span>{label}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {config.hosted && (
          <SidebarGroup>
            <SidebarGroupLabel>Setup</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {SETUP_NAV.map(({ href, label, icon: Icon }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active(href)}
                      tooltip={label}
                      className="h-10 text-[14px] data-[active=true]:bg-brand-soft data-[active=true]:font-semibold data-[active=true]:text-brand-ink"
                    >
                      <Link href={href}>
                        <Icon />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter>
        <LiveCard />
        <SidebarMenu>
          <SidebarMenuItem>
            <ProfileButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function LiveCard() {
  const { tone, text, detail } = useLiveText();
  return (
    <div className="flex items-center gap-3 px-2 py-1.5 group-data-[collapsible=icon]:hidden">
      <StatusDot tone={tone} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-[13px] font-semibold">{text}</p>
        <p className="truncate text-[12px] text-muted-foreground" title={detail}>
          {detail}
        </p>
      </div>
    </div>
  );
}

// ─── Header ───────────────────────────────────────────────────

/**
 * The "+" adds what the page is about: an investment, an EMI, or an expense.
 * Analytics is read-only, so it has none.
 */
/**
 * The sidebar's main action, under the logo: adds what the page is about. Analytics has nothing
 * of its own to add, so there it adds an expense (the button stays put as you move between pages).
 * Collapsed to icons, it's a mint "+" with a tooltip.
 */
function SidebarAddButton() {
  const { setAddOpen } = useDashboard();
  const add = useAddAction() ?? { label: "Add expense", open: () => setAddOpen(true) };
  return (
    <SidebarMenuButton
      tooltip={add.label}
      onClick={add.open}
      className="grid h-9 grid-cols-[1fr_auto_1fr] gap-0 bg-primary font-semibold text-primary-foreground group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:justify-center hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
    >
      {/* The label is what's centred (middle of three columns); the + sits at the end of the left
          column, just before it, so it never pushes the text off centre. Collapsed to icons, the
          label goes and the + stands alone in the middle. */}
      <Plus strokeWidth={2.5} className="mr-1.25 justify-self-end group-data-[collapsible=icon]:mr-0" />
      <span className="group-data-[collapsible=icon]:hidden">{add.label}</span>
    </SidebarMenuButton>
  );
}

function useAddAction() {
  const { setAddOpen, setInvestOpen, setEmiOpen } = useDashboard();
  const active = useActive();
  if (active("/analytics")) return null;
  if (active("/investments")) return { label: "Add investment", open: () => setInvestOpen(true) };
  if (active("/emis")) return { label: "Add EMI", open: () => setEmiOpen(true) };
  return { label: "Add expense", open: () => setAddOpen(true) };
}

function SiteHeader() {
  const { refresh, refreshing, demo } = useDashboard();
  const active = useActive();
  const current = [...NAV, ...SETUP_NAV].find((n) => active(n.href));

  return (
    <header className="pt-safe sticky top-0 z-20 flex shrink-0 items-center gap-2 border-b bg-background/80 backdrop-blur-xl">
      <div className="flex h-14 w-full items-center gap-2 px-4 lg:px-6">
        <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
        <Logo className="size-7 md:hidden" />
        <p className="text-[15px] font-semibold tracking-tight">
          <span className="hidden text-muted-foreground md:inline">Dashboard / </span>
          <Wordmark className="hidden text-[17px] sm:inline md:hidden" />
          <span className="hidden md:inline">{current?.label}</span>
        </p>
        <div className="ml-auto flex items-center gap-1">
          {/* Desktop shows the sync status in the sidebar card; phones have no sidebar, so the badge stays there */}
          <span className="md:hidden">
            <LiveBadge />
          </span>
          {!demo && (
            <Button variant="ghost" size="icon" onClick={refresh} disabled={refreshing} aria-label="Refresh now" title="Refresh now">
              <RefreshCw className={cn(refreshing && "animate-spin")} />
            </Button>
          )}
          <PrivacyToggle />
          <ThemeToggle />
          <div className="md:hidden">
            <ProfileAvatarButton />
          </div>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}

/** Last in the top bar: "Sign out" in red with a red border (the session ends and you land on the sign-in page). */
function SignOutButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      onClick={() =>
        start(() => {
          // The next person on this browser shouldn't see your cached dashboard.
          forgetCachedData();
          return logout();
        })
      }
      disabled={pending}
      aria-busy={pending}
      className="ml-1 h-8 border-bad bg-transparent px-2.5 text-[13px] text-bad hover:bg-bad-soft hover:text-bad sm:px-3 dark:border-bad dark:bg-transparent dark:hover:bg-bad-soft"
    >
      Sign out
    </Button>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useDashboard();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(next)} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}>
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}

// ─── User menu ────────────────────────────────────────────────

function UserAvatar({ small = false }: { small?: boolean }) {
  const { user, profile } = useDashboard();
  return (
    <Avatar className={cn("rounded-lg", small ? "size-7" : "size-8")}>
      <AvatarFallback className="rounded-lg bg-brand-soft text-[12px] font-semibold text-brand-ink">
        {initial(profile?.name ?? user ?? "")}
      </AvatarFallback>
    </Avatar>
  );
}

function UserLabel() {
  const { user, demo, profile, sheetOwner } = useDashboard();
  return (
    <div className="grid flex-1 text-left text-sm leading-tight">
      <span className="truncate font-medium">{profile?.name ?? user ?? "Signed in"}</span>
      <span className="truncate text-[12px] text-muted-foreground" title={sheetOwner ? `Your spreadsheet is in ${sheetOwner}'s Google Drive` : undefined}>
        {sheetOwner ? `Drive: ${sheetOwner}` : (profile?.email ?? (demo ? "Demo data" : "Google Sheet connected"))}
      </span>
    </div>
  );
}

/** The name card in the sidebar: opens your profile. The arrow says it opens something. */
function ProfileButton() {
  const { setProfileOpen } = useDashboard();
  return (
    <SidebarMenuButton size="lg" tooltip="Your profile" onClick={() => setProfileOpen(true)}>
      <UserAvatar />
      <UserLabel />
      <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden />
    </SidebarMenuButton>
  );
}

/** The avatar in the phone's top bar: opens your profile. */
function ProfileAvatarButton() {
  const { setProfileOpen } = useDashboard();
  return (
    <Button variant="ghost" size="icon" aria-label="Your profile" title="Your profile" onClick={() => setProfileOpen(true)}>
      <UserAvatar small />
    </Button>
  );
}

// ─── Live status ──────────────────────────────────────────────

function useLiveText() {
  const { status, live, checkedAt, demo, error } = useDashboard();
  // Tick every second so "Last synced 12s ago" counts up live.
  const now = useTicker(1000);
  const synced = checkedAt ? `Last synced ${syncedAgo(now, checkedAt)}` : "Not synced yet";

  if (demo) return { tone: "warn", text: "Sample data", detail: "Connect your sheet to see yours" };
  if (status === "loading") return { tone: "idle", text: "Connecting…", detail: "Reading your sheet" };
  if (status === "error") return { tone: "bad", text: "Offline", detail: error ?? "Couldn't reach your sheet" };
  switch (live) {
    case "connected":
      return { tone: "good", text: "Live", detail: synced };
    case "connecting":
      return { tone: "idle", text: "Connecting…", detail: synced };
    case "unavailable":
      return { tone: "bad", text: "Reconnecting…", detail: synced };
    case "off":
      return { tone: "warn", text: "Not live", detail: synced };
  }
}

const syncTime = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

/** "12s ago" → "2m 05s ago" → "at 4:05 PM" */
function syncedAgo(now: Date, then: Date) {
  const s = Math.max(0, Math.floor((now.getTime() - then.getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s ago`;
  return `at ${syncTime.format(then)}`;
}

const DOT: Record<string, string> = { good: "bg-good", warn: "bg-warn", bad: "bg-bad", idle: "bg-muted-foreground" };

/** A still dot in the status colour. The text next to it ("Live", "Offline") carries the state. */
function StatusDot({ tone }: { tone: string }) {
  return <span className={cn("inline-flex size-2 shrink-0 rounded-full", DOT[tone])} aria-hidden />;
}

function LiveBadge() {
  const { tone, text, detail } = useLiveText();
  return (
    <span
      className="mr-1 inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
      title={detail}
      aria-live="polite"
    >
      <StatusDot tone={tone} />
      {text}
    </span>
  );
}

// ─── Phone: floating "+" above the tab bar ────────────────────

function AddButtonMobile() {
  const add = useAddAction();
  if (!add) return null;
  return (
    <button
      type="button"
      onClick={add.open}
      aria-label={add.label}
      className="fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+80px)] z-30 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_6px_16px_-6px_rgb(0_0_0/0.6)] transition-transform active:scale-95 md:hidden"
    >
      <Plus className="size-6" strokeWidth={2.5} aria-hidden />
    </button>
  );
}

// ─── Phone tab bar ────────────────────────────────────────────

function MobileTabBar() {
  const active = useActive();
  return (
    <nav aria-label="Main" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-card/90 backdrop-blur-xl md:hidden">
      <div className="grid grid-cols-6">
        {NAV.map(({ href, label, short, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active(href) ? "page" : undefined}
            className={cn("flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium", active(href) ? "text-brand" : "text-muted-foreground")}
          >
            <span className={cn("grid h-7 w-12 place-items-center rounded-full transition-colors", active(href) && "bg-brand-soft")}>
              <Icon size={20} strokeWidth={active(href) ? 2.25 : 1.75} aria-hidden />
            </span>
            {short ?? label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
