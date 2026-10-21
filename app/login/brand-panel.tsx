import { Logo, Wordmark } from "@/components/app-shell";
import { BackdropCanvas } from "./backdrop-canvas";
import { LivePreview } from "./live-preview";

/**
 * The sign-in page's background (desktop): deep green that reaches past the middle of the page and
 * fades out, so the brand side and the form side read as one page. The canvas draws it dithered
 * (smooth, no banding); the CSS fill underneath shows until it has drawn.
 */
export function BrandBackdrop() {
  return (
    <div className="login-backdrop hidden lg:block" aria-hidden>
      <div className="login-backdrop-fill" />
      <BackdropCanvas />
    </div>
  );
}

/** Desktop brand side of the sign-in page: logo, headline and a layered product preview. */
export function BrandPanel() {
  return (
    <section className="login-panel relative hidden overflow-hidden p-12 lg:flex lg:flex-col xl:p-14">
      <div className="relative flex items-center gap-3">
        <Logo className="size-11" />
        <Wordmark className="text-[20px]" />
      </div>

      <div className="relative mt-auto max-w-120">
        <h1 className="text-[44px] leading-[1.06] font-semibold tracking-tight xl:text-[52px]">Har rupaye ka hisaab.</h1>
        <p className="mt-4 max-w-md text-[16px] leading-relaxed text-pretty text-white/65">
          Expenses, EMIs and investments in one place, updated the moment you log them. Your data stays in your own Google Sheet.
        </p>

        <LivePreview />
      </div>
    </section>
  );
}
