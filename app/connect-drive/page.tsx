import { FileSpreadsheet, FolderLock, UserRound } from "lucide-react";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { hostedConfig } from "@/lib/server/config";
import { hostedServices } from "@/lib/server/hosted";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/server/session";
import { AuthFrame, AuthHeading } from "../login/auth-frame";
import { Alert, GoogleButton } from "../login/auth-ui";
import { SignOutLink } from "./sign-out-link";

export const metadata: Metadata = { title: "Connect Google Drive" };

/** Why the last attempt failed (`?error=…` from the Google callback). */
const ERRORS: Record<string, string> = {
  cancelled: "You left Google's page before allowing access. hisabo needs it to keep your data in your Drive.",
  "drive-not-granted":
    "Google didn't give hisabo access to Drive. On Google's page, tick the box that lets hisabo see, edit, create and delete only the files it uses.",
  "google-in-use": "That Google account already belongs to another hisabo account. Sign out, then use Continue with Google to open it.",
  failed: "Connecting Google Drive didn't work. Try again in a moment.",
  "no-email": "Connecting Google Drive didn't work. Try again in a moment.",
};

/** Every hosted account connects Drive once (and again if access is removed). The proxy keeps users here until then. */
export default function ConnectDrivePage({ searchParams }: PageProps<"/connect-drive">) {
  return (
    <AuthFrame>
      <Suspense>
        <Card searchParams={searchParams} />
      </Suspense>
    </AuthFrame>
  );
}

async function Card({ searchParams }: Pick<PageProps<"/connect-drive">, "searchParams">) {
  const config = hostedConfig();
  const session = await verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!config || session?.kind !== "hosted") redirect("/login");

  const { error } = await searchParams;
  const message = ERRORS[typeof error === "string" ? error : ""];
  // Had a spreadsheet before: Google access was removed, or the file was deleted.
  const reconnecting = !!(await hostedServices(config).users.get(session.uid));

  return (
    <>
      <AuthHeading title={reconnecting ? "Reconnect Google Drive" : "Connect Google Drive"}>
        {reconnecting
          ? "hisabo can't reach your spreadsheet any more. Connect Google Drive again to carry on."
          : "hisabo keeps your expenses in a spreadsheet in your own Google Drive."}
      </AuthHeading>

      <ul className="mt-7 space-y-4 text-[14px] text-pretty text-ink-2">
        <li className="flex gap-3">
          <FolderLock className="mt-0.5 size-4.5 shrink-0 text-brand" aria-hidden />
          <span>hisabo creates one spreadsheet, called hisabo, and can only open files it creates. It can&apos;t see anything else in your Drive.</span>
        </li>
        <li className="flex gap-3">
          <FileSpreadsheet className="mt-0.5 size-4.5 shrink-0 text-brand" aria-hidden />
          <span>It&apos;s yours: open, edit, share or delete it whenever you like.</span>
        </li>
        <li className="flex gap-3">
          <UserRound className="mt-0.5 size-4.5 shrink-0 text-brand" aria-hidden />
          <span>
            Google will suggest <span className="font-medium text-ink">{session.email}</span>. You can choose a different Google account.
          </span>
        </li>
      </ul>

      <div className="mt-8 space-y-4">
        {message && <Alert>{message}</Alert>}
        <GoogleButton intent="connect" label={reconnecting ? "Reconnect Google Drive" : "Connect Google Drive"} />
      </div>

      <p className="mt-6 text-center text-[13px] text-ink-3">
        Signed in as {session.email} · <SignOutLink />
      </p>
    </>
  );
}
