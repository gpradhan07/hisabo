import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";
import { AuthFrame } from "../login/auth-frame";
import { VerifyEmailCard } from "./verify-email-card";

export const metadata: Metadata = { title: "Confirm your email" };

/** After email sign-up, until the confirmation link is clicked (the proxy keeps unconfirmed users here). */
export default function VerifyEmailPage() {
  return (
    <AuthFrame>
      <Suspense>
        <Card />
      </Suspense>
    </AuthFrame>
  );
}

async function Card() {
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  return <VerifyEmailCard email={session?.kind === "hosted" ? session.email : ""} />;
}
