import { KeyRound, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { Suspense } from "react";
import { isHosted } from "@/lib/server/config";
import { AuthFrame, AuthHeading } from "./auth-frame";
import { HostedAuth } from "./hosted-auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  if (isHosted()) {
    return (
      <AuthFrame
        footer={
          <>
            <ShieldCheck size={14} className="shrink-0 text-brand" aria-hidden />
            Your data stays in a spreadsheet in your own Google Drive.
          </>
        }
      >
        <Suspense>
          <HostedAuth />
        </Suspense>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame
      footer={
        <>
          <KeyRound size={14} className="shrink-0 text-brand" aria-hidden />
          Credentials are set in your environment file (.env.local).
        </>
      }
    >
      <AuthHeading title="Welcome back">Sign in to see your dashboard.</AuthHeading>
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthFrame>
  );
}
