"use client";

import { ArrowDownWideNarrow, CreditCard, Download, Inbox, Pencil, Search, SearchX, Tag, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useDeferredValue, useMemo, useState } from "react";
import { CategoryAvatar } from "@/components/category-avatar";
import { DeleteButton, DeleteDialog, useCanDelete, useHidden, type DeleteTarget } from "@/components/delete-dialog";
import { useDashboard } from "@/components/data-provider";
import { Card, EmptyState, Skeleton, StatGrid, StatTile, cx } from "@/components/kit";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePeriodData } from "@/components/use-period-data";
import { byPaymentMethod, paymentLabel } from "@/lib/analytics";
import { addDays, isSameDay, startOfDay } from "@/lib/dates";
import { expenseTitle } from "@/lib/api";
import { fmtDate, fmtDay, fmtTime } from "@/lib/format";
import type { Expense } from "@/lib/types";

type Sort = "newest" | "oldest" | "highest" | "lowest";
const PAGE = 40;
const ALL = "__all";

export function TransactionsView() {
  const { data, fmt, now, freshIds, range, setEditing } = useDashboard();
  const pd = usePeriodData();
  const params = useSearchParams();
  const router = useRouter();
  const category = params.get("category");

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [limit, setLimit] = useState(PAGE);
  const [paidWith, setPaidWith] = useState(ALL);
  const q = useDeferredValue(query.trim().toLowerCase());
  const [toDelete, setToDelete] = useState<DeleteTarget | null>(null);
  const hidden = useHidden();
  // Deleting and editing change the user's own spreadsheet: hosted mode only (the Apps Script can't yet).
  const canDelete = useCanDelete();
  const deleteTarget = (e: Expense): DeleteTarget => ({
    question: e.id.startsWith("s") ? "Delete this subscription payment?" : "Delete this expense?",
    title: expenseTitle(e),
    detail: `${e.category} · ${fmtDate(e.date)}, ${fmtTime(e.date)}`,
    amount: e.amount,
    done: `Deleted ${fmt.moneyExact(e.amount)} · ${expenseTitle(e)}`,
    items: [{ id: e.id, date: e.date.toISOString(), amount: e.amount }],
    hide: [e.id],
  });
  // Subscription payments (`s…`) are edited where they were logged; expenses (`e…`) here.
  const canEdit = (e: Expense) => canDelete && e.id.startsWith("e");

  const setCategory = (c: string | null) => {
    const next = new URLSearchParams(params);
    if (c) next.set("category", c);
    else next.delete("category");
    router.replace(`/transactions${next.size ? `?${next}` : ""}`, { scroll: false });
    setLimit(PAGE);
  };

  const rows = useMemo(() => {
    if (!pd) return [];
    const list = pd.items.filter(
      (e) =>
        !hidden.ids.has(e.id) &&
        (!category || e.category === category) &&
        (paidWith === ALL || paymentLabel(e) === paidWith) &&
        (!q ||
          e.remark.toLowerCase().includes(q) ||
          (e.merchant ?? "").toLowerCase().includes(q) ||
          e.category.toLowerCase().includes(q) ||
          paymentLabel(e).toLowerCase().includes(q) ||
          String(e.amount).includes(q)),
    );
    const by: Record<Sort, (a: Expense, b: Expense) => number> = {
      newest: (a, b) => b.date.getTime() - a.date.getTime(),
      oldest: (a, b) => a.date.getTime() - b.date.getTime(),
      highest: (a, b) => b.amount - a.amount,
      lowest: (a, b) => a.amount - b.amount,
    };
    return list.sort(by[sort]);
  }, [pd, category, paidWith, q, sort, hidden.ids]);
  const methods = useMemo(() => (pd ? byPaymentMethod(pd.items).map((m) => m.label) : []), [pd]);

  if (!data || !pd) {
    return (
      <>
        <PageHeader title="Transactions" />
        <Skeleton className="mb-4 h-24" />
        <Skeleton className="h-120" />
      </>
    );
  }

  const total = rows.reduce((s, e) => s + e.amount, 0);
  const largest = rows.reduce<Expense | null>((m, e) => (!m || e.amount > m.amount ? e : m), null);
  const shown = rows.slice(0, limit);
  const byDate = sort === "newest" || sort === "oldest";
  const dayName = (d: Date) => (isSameDay(d, now) ? "Today" : isSameDay(d, addDays(now, -1)) ? "Yesterday" : fmtDay(d));
  const dayTotals = new Map<number, number>();
  for (const e of rows) {
    const k = startOfDay(e.date).getTime();
    dayTotals.set(k, (dayTotals.get(k) ?? 0) + e.amount);
  }

  const exportCsv = () => {
    const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [
      "Date,Time,Category,Merchant,Remark,Paid with,Amount",
      ...rows.map((e) =>
        [
          esc(fmtDate(e.date)),
          esc(fmtTime(e.date)),
          esc(e.category),
          esc(e.merchant ?? ""),
          esc(e.remark),
          esc(e.paymentMethod ? paymentLabel(e) : ""),
          e.amount,
        ].join(","),
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `expenses-${range.id}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHeader title="Transactions" />

      <StatGrid className="mb-4">
        <StatTile label="Entries" value={rows.length.toLocaleString()} />
        <StatTile label="Total" value={fmt.money(total)} />
        <StatTile label="Average per entry" value={rows.length ? fmt.money(total / rows.length) : "—"} />
        <StatTile label="Largest" value={largest ? fmt.money(largest.amount) : "—"} sub={largest ? expenseTitle(largest) : undefined} />
      </StatGrid>

      <Card>
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-55">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Search transactions"
              aria-label="Search transactions"
              className="h-10 pl-9 text-[16px] sm:text-[14px]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={category ?? ALL} onValueChange={(v) => setCategory(v === ALL ? null : v)}>
              <SelectTrigger className="h-10! min-w-0 flex-1 sm:w-44 sm:flex-none" aria-label="Category">
                <Tag className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All categories</SelectItem>
                {pd.categories.map((c) => (
                  <SelectItem key={c.category} value={c.category}>
                    {c.category}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={paidWith}
              onValueChange={(v) => {
                setPaidWith(v);
                setLimit(PAGE);
              }}
            >
              <SelectTrigger className="h-10! min-w-0 flex-1 sm:w-52 sm:flex-none" aria-label="Paid with">
                <CreditCard className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All payments</SelectItem>
                {methods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sort} onValueChange={(v) => setSort(v as Sort)}>
              <SelectTrigger className="h-10! min-w-0 flex-1 sm:w-36 sm:flex-none" aria-label="Sort">
                <ArrowDownWideNarrow className="text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="oldest">Oldest</SelectItem>
                <SelectItem value="highest">Highest</SelectItem>
                <SelectItem value="lowest">Lowest</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="lg" className="h-10" onClick={exportCsv} disabled={!rows.length} aria-label="Export CSV">
              <Download />
              <span className="hidden sm:inline">Export</span>
            </Button>
          </div>
        </div>

        {(category || paidWith !== ALL) && (
          <div className="mb-3 flex flex-wrap gap-2">
            {category && (
              <Button variant="secondary" size="sm" className="w-fit rounded-full bg-brand-soft text-brand-ink" onClick={() => setCategory(null)}>
                {category}
                <X className="text-bad" aria-label="Clear category" />
              </Button>
            )}
            {paidWith !== ALL && (
              <Button variant="secondary" size="sm" className="w-fit rounded-full bg-brand-soft text-brand-ink" onClick={() => setPaidWith(ALL)}>
                {paidWith}
                <X className="text-bad" aria-label="Clear payment method" />
              </Button>
            )}
          </div>
        )}

        {rows.length === 0 ? (
          pd.items.length === 0 ? (
            <EmptyState icon={<Inbox size={20} />} title="No transactions in this period" />
          ) : (
            <EmptyState icon={<SearchX size={20} />} title="Nothing matches" body="Try a different search, category or payment method." />
          )
        ) : (
          <>
            {/* Desktop: shadcn table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Description</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    {canDelete && (
                      <TableHead className="w-20">
                        <span className="sr-only">Edit or delete</span>
                      </TableHead>
                    )}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((e, i) => (
                    <Fragment key={e.id}>
                      {byDate && (i === 0 || !isSameDay(shown[i - 1].date, e.date)) && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell colSpan={canDelete ? 5 : 4} className="pt-4 pb-1.5 text-[12px] font-medium text-muted-foreground">
                            <div className="flex items-baseline justify-between">
                              <span>{dayName(e.date)}</span>
                              <span className="tabular-nums">{fmt.money(dayTotals.get(startOfDay(e.date).getTime()) ?? 0)}</span>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                      <TableRow className={cx(freshIds.has(e.id) && "animate-flash")}>
                        <TableCell className="py-2.5">
                          <div className="flex items-center gap-3">
                            <CategoryAvatar category={e.category} slots={pd.slots} size={34} />
                            <span className="min-w-0 truncate text-[14px] font-medium">
                              {expenseTitle(e)}
                              {e.merchant && e.remark && <span className="font-normal text-muted-foreground"> · {e.remark}</span>}
                              {e.paymentMethod && <span className="font-normal text-muted-foreground"> · {e.cardName || e.paymentMethod}</span>}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="cursor-pointer rounded-full" onClick={() => setCategory(e.category)}>
                            {e.category}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-[13px] text-muted-foreground">
                          {byDate ? fmtTime(e.date) : `${dayName(e.date)}, ${fmtTime(e.date)}`}
                        </TableCell>
                        <TableCell className="text-right text-[14px] font-semibold tabular-nums">{fmt.moneyExact(e.amount)}</TableCell>
                        {canDelete && (
                          <TableCell className="py-1 pr-0">
                            <div className="flex justify-end">
                              {canEdit(e) && <EditButton expense={e} onClick={setEditing} />}
                              <DeleteButton label={`Delete ${expenseTitle(e)}`} onClick={() => setToDelete(deleteTarget(e))} />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Phone: grouped list */}
            <div className="md:hidden">
              {shown.map((e, i) => {
                const newDay = byDate && (i === 0 || !isSameDay(shown[i - 1].date, e.date));
                return (
                  <div key={e.id}>
                    {newDay && (
                      <div className="flex items-baseline justify-between pt-4 pb-1.5 text-[12px] font-medium text-muted-foreground">
                        <span>{dayName(e.date)}</span>
                        <span className="tabular-nums">{fmt.money(dayTotals.get(startOfDay(e.date).getTime()) ?? 0)}</span>
                      </div>
                    )}
                    <div className={cx("-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5", freshIds.has(e.id) && "animate-flash")}>
                      <CategoryAvatar category={e.category} slots={pd.slots} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-medium">{expenseTitle(e)}</p>
                        <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
                          {[
                            e.category,
                            e.merchant && e.remark ? e.remark : null,
                            e.cardName || e.paymentMethod || null,
                            byDate ? fmtTime(e.date) : `${dayName(e.date)}, ${fmtTime(e.date)}`,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums">{fmt.moneyExact(e.amount)}</span>
                      {canEdit(e) && <EditButton expense={e} onClick={setEditing} className="-mr-2" />}
                      {canDelete && <DeleteButton label={`Delete ${expenseTitle(e)}`} onClick={() => setToDelete(deleteTarget(e))} className="-mr-1" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {rows.length > limit && (
              <div className="mt-4 flex justify-center">
                <Button variant="outline" size="lg" onClick={() => setLimit((l) => l + PAGE * 2)}>
                  Show more ({(rows.length - limit).toLocaleString()} left)
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      <DeleteDialog target={toDelete} onClose={() => setToDelete(null)} onDeleted={(t) => hidden.hide(t.hide)} />
    </>
  );
}

function EditButton({ expense, onClick, className }: { expense: Expense; onClick: (e: Expense) => void; className?: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cx("shrink-0 text-muted-foreground", className)}
      onClick={() => onClick(expense)}
      aria-label={`Edit ${expenseTitle(expense)}`}
    >
      <Pencil />
    </Button>
  );
}
