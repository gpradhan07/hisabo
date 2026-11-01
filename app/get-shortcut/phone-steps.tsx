"use client";

import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ShortcutButton } from "@/components/views/add-to-iphone";

const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};

/** The key comes after the # (from the QR made right after Create key), so it never reaches a server. */
export function PhoneSteps({ shortcutUrl }: { shortcutUrl: string }) {
  const hash = useSyncExternalStore(subscribe, () => location.hash, () => "");
  const key = /^#hk_[\w-]{20,}$/.test(hash) ? hash.slice(1) : null;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(key ?? "");
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  if (!key) {
    return (
      <ol className="mt-6 space-y-5">
        <PhoneStep n={1} title="Add the Shortcut">
          <ShortcutButton url={shortcutUrl} />
        </PhoneStep>
        <PhoneStep n={2} title="Get your key">
          <p>
            Sign in to hisabo on this phone, open <span className="font-medium text-ink">Add to iPhone</span> and tap{" "}
            <span className="font-medium text-ink">Create key</span>. Paste it when the Shortcut asks.
          </p>
          <Button asChild variant="outline" className="mt-3 h-10">
            <Link href="/add-to-iphone">Open hisabo</Link>
          </Button>
        </PhoneStep>
      </ol>
    );
  }

  return (
    <ol className="mt-6 space-y-5">
      <PhoneStep n={1} title="Copy your key">
        {/* Wraps rather than truncates: one unbroken line would widen the card past a phone screen */}
        <code className="block rounded-lg border border-white/10 px-3 py-2 font-mono text-[13px] break-all text-ink select-all">{key}</code>
        <Button onClick={copy} variant={copied ? "outline" : "default"} className="mt-3 h-10">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? "Copied" : "Copy key"}
        </Button>
      </PhoneStep>
      <PhoneStep n={2} title="Add the Shortcut">
        <ShortcutButton url={shortcutUrl} />
        <p className="mt-3">
          When it asks for your key, paste it and tap <span className="font-medium text-ink">Add Shortcut</span>. If that screen stays open, swipe it down: the
          Shortcut is already added, with your key.
        </p>
      </PhoneStep>
    </ol>
  );
}

function PhoneStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-ink">{n}</span>
      <div className="min-w-0 flex-1 text-[14px] text-pretty text-ink-2">
        <h3 className="mb-2 font-medium text-ink">{title}</h3>
        {children}
      </div>
    </li>
  );
}
