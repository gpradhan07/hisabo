import { KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Logo, Wordmark } from "@/components/app-shell";
import { BrandBackdrop, BrandPanel } from "./brand-panel";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    // Always dark: the brand side and the form share one background (see BrandBackdrop).
    <main className="theme-dark relative grid min-h-dvh overflow-hidden bg-background text-foreground lg:grid-cols-[1.1fr_1fr]">
      <BrandBackdrop />
      <BrandPanel />

      {/* Form */}
      <section className="pt-safe relative flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-[26rem] animate-rise">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <Logo className="size-12" />
            <div className="leading-tight">
              <Wordmark className="text-[26px]" />
              <p className="text-[13px] text-ink-2">Har rupaye ka hisaab.</p>
            </div>
          </div>
          <div className="login-form-card rounded-xl">
            <div className="p-6 sm:p-8">
              <h2 className="text-[28px] font-semibold tracking-tight text-ink">Welcome back</h2>
              <p className="mt-1.5 text-[15px] text-ink-2">Sign in to see your dashboard.</p>
              <Suspense>
                <LoginForm />
              </Suspense>
            </div>
            <p className="flex items-center justify-center gap-2 border-t border-white/[0.07] px-6 py-4 text-center text-[12px] text-ink-3">
              <KeyRound size={14} className="shrink-0 text-brand" aria-hidden />
              Credentials are set in your environment file (.env.local).
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

