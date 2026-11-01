import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { Skeleton } from "@/components/kit";
import { AddToIphoneView } from "@/components/views/add-to-iphone";
import { hostedConfig, shortcutUrl } from "@/lib/server/config";
import { hostedServices } from "@/lib/server/hosted";
import { activeKeys } from "@/lib/server/phone-keys";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";

export const metadata: Metadata = { title: "Add to iPhone" };

export default function AddToIphonePage() {
  return (
    <Suspense fallback={<Skeleton className="h-130" />}>
      <Content />
    </Suspense>
  );
}

async function Content() {
  const config = hostedConfig();
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  // Self-host mode: the Shortcut posts straight to the Apps Script (README, step 1).
  if (!config || session?.kind !== "hosted") return <AddToIphoneView keys={null} shortcutUrl="" appUrl="" />;

  const keys = await activeKeys(hostedServices(config).phoneKeys, session.uid);
  return <AddToIphoneView keys={keys} shortcutUrl={shortcutUrl()} appUrl={config.appUrl} />;
}
