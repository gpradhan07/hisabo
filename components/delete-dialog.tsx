"use client";

import { LoaderCircle, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteEntries, type DeleteItem } from "@/app/(dashboard)/actions";
import { useDashboard } from "@/components/data-provider";
import { cx } from "@/components/kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Dataset } from "@/lib/types";

/** What a delete removes, as the confirm dialog shows it. `items` are the sheet rows: one, or an EMI with its payments. */
export interface DeleteTarget {
  /** "Delete this expense?" */
  question: string;
  /** under the question; by default "It's removed from your Google Sheet too. This can't be undone." */
  note?: string;
  title: string;
  detail: string;
  amount: number;
  /** the toast afterwards: "Deleted ₹630.00 · Zomato" */
  done: string;
  items: DeleteItem[];
  /** IDs (or keys) to hide at once, until the reload brings fresh rows */
  hide: string[];
}

/** Deleting changes the user's own spreadsheet: hosted mode only (the Apps Script can't delete rows yet). */
export function useCanDelete() {
  const { config, demo } = useDashboard();
  return config.hosted && !demo;
}

const NONE: ReadonlySet<string> = new Set();

/** Rows just deleted on this page, hidden until the reload brings fresh data (whose row-number IDs have shifted). */
export function useHidden() {
  const { data } = useDashboard();
  const [hidden, setHidden] = useState<{ data: Dataset | null; ids: ReadonlySet<string> }>({ data: null, ids: NONE });
  const ids = hidden.data === data ? hidden.ids : NONE;
  const hide = useCallback((more: string[]) => setHidden({ data, ids: new Set([...ids, ...more]) }), [data, ids]);
  return { ids, hide };
}

export function DeleteButton({ label, onClick, className }: { label: string; onClick: () => void; className?: string }) {
  return (
    <Button variant="ghost" size="icon" className={cx("shrink-0 text-muted-foreground hover:text-bad", className)} onClick={onClick} aria-label={label}>
      <Trash2 />
    </Button>
  );
}

/** Confirms, then deletes the rows from the sheet (all or none). */
export function DeleteDialog({ target, onClose, onDeleted }: { target: DeleteTarget | null; onClose: () => void; onDeleted: (t: DeleteTarget) => void }) {
  const { fmt, refresh } = useDashboard();
  const router = useRouter();
  const [pending, start] = useTransition();

  const confirm = () => {
    if (!target) return;
    start(async () => {
      const res = await deleteEntries(target.items);
      if (!res.ok) {
        if (res.code === "connect-drive") router.replace("/connect-drive");
        else toast.error(res.error);
        return;
      }
      onDeleted(target);
      onClose();
      toast.success(target.done);
      refresh();
    });
  };

  return (
    <Dialog open={!!target} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent className="rounded-xl sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[20px] font-semibold tracking-tight">{target?.question}</DialogTitle>
          <DialogDescription>{target?.note ?? "It's removed from your Google Sheet too. This can't be undone."}</DialogDescription>
        </DialogHeader>
        {target && (
          // min-w-0: a long detail line truncates instead of widening the dialog past a phone screen
          <div className="flex min-w-0 items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-medium">{target.title}</p>
              <p className="truncate text-[12px] text-muted-foreground">{target.detail}</p>
            </div>
            <span className="shrink-0 text-[14px] font-semibold tabular-nums">{fmt.moneyExact(target.amount)}</span>
          </div>
        )}
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" size="lg" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" size="lg" onClick={confirm} disabled={pending} className="min-w-28">
            {pending ? <LoaderCircle className="animate-spin" aria-hidden /> : <Trash2 aria-hidden />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
