"use client";

import { Copy, Download, ExternalLink, KeyRound, LoaderCircle, ShieldCheck, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useState, useTransition, type SubmitEvent } from "react";
import { toast } from "sonner";
import { createPairing, revokePairing, type NewPairing } from "@/app/(dashboard)/add-to-iphone/actions";
import { Card, EmptyState, ToneIcon } from "@/components/kit";
import { InstallSteps } from "@/components/install-steps";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fmtRelative, fmtShortDate } from "@/lib/format";

type PhoneKey = { id: string; label: string; createdAt: number; lastUsedAt?: number };

/**
 * `keys` is null in self-host mode, where the Shortcut posts straight to the Apps Script.
 * The QR codes open the public /get-shortcut and /get-app pages on the iPhone.
 */
export function AddToIphoneView({ keys, shortcutUrl, appUrl }: { keys: PhoneKey[] | null; shortcutUrl: string; appUrl: string }) {
  const [paired, setPaired] = useState(keys ?? []);

  if (keys === null) {
    return (
      <>
        <PageHeader title="Add to iPhone" withPeriod={false} />
        <Card title="Self-host mode">
          <p className="text-[14px] text-pretty text-muted-foreground">
            Your Shortcut posts straight to your Apps Script web app, so there&apos;s nothing to pair here. The README&apos;s Apps Script steps cover it.
          </p>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Add to iPhone" subtitle="Log expenses in a few taps, or with Siri." withPeriod={false} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start">
        <div className="grid gap-4">
          <PairIphone shortcutUrl={shortcutUrl} phoneUrl={`${appUrl}/get-shortcut`} onPaired={(k) => setPaired((list) => [k, ...list])} />
          <GetApp url={`${appUrl}/get-app`} />
        </div>
        <PairedList keys={paired} onRemoved={(id) => setPaired((list) => list.filter((k) => k.id !== id))} />
      </div>
    </>
  );
}

/** The Shortcut's own file downloads; an iCloud link opens Apple's page in a new tab. */
export function ShortcutButton({ url }: { url: string }) {
  const file = url.startsWith("/");
  return (
    <Button asChild className="h-10">
      <a href={url} {...(file ? { download: "hisabo.shortcut" } : { target: "_blank", rel: "noreferrer" })}>
        {file ? <Download aria-hidden /> : null}
        Get the Shortcut
        {file ? null : <ExternalLink aria-hidden />}
      </a>
    </Button>
  );
}

/** For a computer screen: the iPhone camera opens `url`. Hidden on phones, which can't scan themselves. */
function ScanQr({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <div className="hidden items-center gap-4 rounded-lg border p-3 md:flex">
      {/* Dark on white whatever the theme: cameras read that best */}
      <div className="shrink-0 rounded-md bg-white p-2">
        <QRCodeSVG value={url} size={112} level="M" marginSize={0} />
      </div>
      <p className="text-[13px] text-pretty text-muted-foreground">{children}</p>
    </div>
  );
}

/** Already opened from the Home Screen? Then there's nothing to install (CSS only, so no flash). */
function GetApp({ url }: { url: string }) {
  return (
    <div className="[@media(display-mode:standalone)]:hidden">
      <Card title="Get the dashboard as an app" subtitle="hisabo on your Home Screen, full screen, like any other app.">
        <ScanQr url={url}>Scan this with your iPhone camera. It shows how to add hisabo to your Home Screen.</ScanQr>
        <div className="md:hidden">
          <InstallSteps />
        </div>
      </Card>
    </div>
  );
}

function PairIphone({ shortcutUrl, phoneUrl, onPaired }: { shortcutUrl: string; phoneUrl: string; onPaired: (key: PhoneKey) => void }) {
  const [label, setLabel] = useState("");
  const [pairing, setPairing] = useState<Extract<NewPairing, { ok: true }> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const create = (e: SubmitEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await createPairing(label);
      if (!res.ok) return setError(res.error);
      setError(null);
      setPairing(res);
      onPaired(res.key);
    });
  };

  const key = pairing ? (JSON.parse(pairing.setupCode) as { key: string }).key : "";

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copied. On an iPhone with the same Apple ID, you can paste it there.`);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it instead.");
    }
  };

  if (pairing) {
    return (
      <Card title={`Pair “${pairing.key.label}”`} subtitle="Shown once. Close it when your iPhone is paired.">
        {/* The key rides after the #, which browsers never send to the server */}
        <ScanQr url={`${phoneUrl}#${key}`}>Scan this with your iPhone camera. It opens a page with this key and the Shortcut, ready to paste.</ScanQr>
        <p className="text-[14px] text-pretty text-muted-foreground md:hidden">Copy your key, tap Get the Shortcut, and paste the key when it asks.</p>
        <div className="mt-4">
          <CopyField label="Your key" value={key} onCopy={() => copy(key, "Key")} />
        </div>
        <div className="mt-4 md:hidden">
          <ShortcutButton url={shortcutUrl} />
        </div>
        <p className="mt-5 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-[13px] text-pretty text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden />
          This code lets one iPhone add entries to your sheet. It can&apos;t read anything. If it ends up somewhere it shouldn&apos;t, remove the iPhone from the list.
        </p>
        <Button variant="outline" className="mt-4 h-10 self-start" onClick={() => setPairing(null)}>
          Done
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Add the Shortcut" subtitle="Log an expense, subscription, investment or EMI in a few taps. Each iPhone gets its own key.">
      <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-2">
          <Label htmlFor="phone-label">Name this iPhone</Label>
          <Input id="phone-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="My iPhone" maxLength={40} className="h-10" />
        </div>
        <Button type="submit" disabled={pending} className="h-10">
          {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <KeyRound aria-hidden />}
          Create key
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-bad">
          {error}
        </p>
      )}
    </Card>
  );
}

function CopyField({ label, value, onCopy }: { label: string; value: string; onCopy: () => void }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[12px] font-medium text-foreground">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg border bg-muted/40 px-3 py-2 font-mono text-[13px] text-foreground select-all">{value}</code>
        <Button variant="outline" className="h-9 shrink-0" onClick={onCopy}>
          <Copy aria-hidden />
          Copy
        </Button>
      </div>
    </div>
  );
}

function PairedList({ keys, onRemoved }: { keys: PhoneKey[]; onRemoved: (id: string) => void }) {
  return (
    <Card title="Paired iPhones" subtitle="Each one can add entries. None can read your data.">
      {keys.length === 0 ? (
        <EmptyState icon={<Smartphone size={22} />} title="No iPhones yet" body="Pair one to log expenses from your home screen." />
      ) : (
        <ul className="-my-1 divide-y">
          {keys.map((k) => (
            <PairedRow key={k.id} phone={k} onRemoved={onRemoved} />
          ))}
        </ul>
      )}
    </Card>
  );
}

function PairedRow({ phone, onRemoved }: { phone: PhoneKey; onRemoved: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const res = await revokePairing(phone.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      onRemoved(phone.id);
      toast.success(`Removed ${phone.label}. Its key no longer works.`);
    });

  return (
    <li className="flex items-center gap-3 py-3.5">
      <ToneIcon tone="neutral">
        <Smartphone size={18} />
      </ToneIcon>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-medium">{phone.label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Added {fmtShortDate(new Date(phone.createdAt))} · {phone.lastUsedAt ? `last used ${fmtRelative(new Date(phone.lastUsedAt))}` : "not used yet"}
        </p>
      </div>
      {confirming ? (
        <div className="flex shrink-0 gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" size="sm" onClick={remove} disabled={pending}>
            {pending && <LoaderCircle className="animate-spin" aria-hidden />}
            Remove
          </Button>
        </div>
      ) : (
        <Button variant="outline" size="sm" className="shrink-0" onClick={() => setConfirming(true)}>
          Remove
        </Button>
      )}
    </li>
  );
}
