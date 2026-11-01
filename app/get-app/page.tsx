import type { Metadata } from "next";
import { InstallSteps } from "@/components/install-steps";
import { AuthFrame, AuthHeading } from "../login/auth-frame";

export const metadata: Metadata = { title: "Get the app" };

/** Public: the "Get the dashboard as an app" QR on Add to iPhone opens this on the iPhone. */
export default function GetAppPage() {
  return (
    <AuthFrame>
      <AuthHeading title="hisabo on your Home Screen">Add it once, then open it like any app.</AuthHeading>
      <div className="mt-6">
        <InstallSteps />
      </div>
    </AuthFrame>
  );
}
