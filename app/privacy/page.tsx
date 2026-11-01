import type { Metadata } from "next";
import Link from "next/link";
import { AuthFrame, AuthHeading } from "../login/auth-frame";

export const metadata: Metadata = { title: "Privacy" };

/** Public (no sign-in), so Google's consent screen can link to it. Keep it in step with what hosted mode stores. */
export default function PrivacyPage() {
  return (
    <AuthFrame footer={<Link href="/login" className="underline-offset-4 hover:underline">Back to hisabo</Link>}>
      <AuthHeading title="Privacy">What hisabo keeps, and where.</AuthHeading>
      <div className="mt-6 space-y-4 text-[14px] text-pretty text-ink-2">
        <Section title="Your money entries">
          They live in the hisabo Google Sheet in your own Google Drive. hisabo reads that sheet to show your dashboard and adds the rows you save. They aren&apos;t
          copied to hisabo&apos;s servers, shared or sold.
        </Section>
        <Section title="Google Drive access">
          hisabo asks only for access to the files it creates. It can&apos;t see anything else in your Drive.
        </Section>
        <Section title="Your account">
          hisabo keeps your email, your name from Google, an encrypted permission to reach your hisabo sheet, and a scrambled (hashed) copy of each iPhone key.
          These are stored in Google Firebase.
        </Section>
        <Section title="Removing it">
          Revoke an iPhone key on the Add to iPhone page. Remove hisabo&apos;s Drive access at myaccount.google.com/permissions. Your sheet stays yours: delete it
          from Drive whenever you like.
        </Section>
      </div>
    </AuthFrame>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="font-medium text-ink">{title}</h3>
      <p className="mt-1">{children}</p>
    </section>
  );
}
