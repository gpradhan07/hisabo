import { Share, SquarePlus } from "lucide-react";
import type { ReactNode } from "react";

/** iPhones have no install prompt: Safari's Share menu is the only way onto the Home Screen. */
export function InstallSteps() {
  return (
    <ol className="space-y-3 text-[14px] text-pretty text-muted-foreground">
      <Item n={1}>
        In Safari, tap <Strong>Share</Strong> <Share className="inline size-4 align-[-3px] text-foreground" aria-label="(the square with an arrow)" />. On newer
        iPhones it&apos;s inside the <Strong>•••</Strong> menu.
      </Item>
      <Item n={2}>
        Tap <Strong>Add to Home Screen</Strong> <SquarePlus className="inline size-4 align-[-3px] text-foreground" aria-hidden />, then <Strong>Add</Strong>.
      </Item>
      <Item n={3}>Open hisabo from your Home Screen and sign in once. It opens full screen, like any other app.</Item>
    </ol>
  );
}

function Item({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-soft text-[12px] font-semibold text-brand-ink">{n}</span>
      <p className="min-w-0 flex-1 pt-0.5">{children}</p>
    </li>
  );
}

const Strong = ({ children }: { children: ReactNode }) => <span className="font-medium text-foreground">{children}</span>;
