import type { Metadata } from "next";
import { shortcutUrl } from "@/lib/server/config";
import { AuthFrame, AuthHeading } from "../login/auth-frame";
import { PhoneSteps } from "./phone-steps";

export const metadata: Metadata = { title: "Get the Shortcut" };

/** Public: the QR codes on Add to iPhone open this on the iPhone, which may not be signed in. */
export default function GetShortcutPage() {
  return (
    <AuthFrame>
      <AuthHeading title="hisabo on your iPhone">Two steps, about a minute.</AuthHeading>
      <PhoneSteps shortcutUrl={shortcutUrl()} />
    </AuthFrame>
  );
}
