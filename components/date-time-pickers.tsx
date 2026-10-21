"use client";

import { CalendarDays, ChevronDown, Clock } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { addDays, addMonths, isSameDay, startOfDay } from "@/lib/dates";
import { cn } from "@/lib/utils";

const longDate = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const thisYearDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });
const otherYearDate = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "2-digit" });

/**
 * shadcn Calendar in a popover. Future days are disabled unless `allowFuture`.
 * Quick picks: today + yesterday, or today + a month from now when future dates are allowed.
 */
export function DatePicker({
  id,
  value,
  onChange,
  today,
  invalid,
  allowFuture = false,
}: {
  id: string;
  value: Date;
  onChange: (d: Date) => void;
  today: Date;
  invalid?: boolean;
  allowFuture?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pick = (d: Date) => {
    onChange(startOfDay(d));
    setOpen(false);
  };
  const other = allowFuture
    ? { label: "In a month", date: addMonths(today, 1) }
    : { label: "Yesterday", date: addDays(today, -1) };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          aria-invalid={invalid}
          className="h-11 w-full justify-start gap-2.5 rounded-lg px-3 text-left text-[15px] font-normal sm:text-[14px]"
        >
          <CalendarDays className="text-muted-foreground" />
          {/* phones get a short date (no year when it's this year) so it never truncates */}
          <span className="flex-1 truncate">
            <span className="sm:hidden">{(value.getFullYear() === today.getFullYear() ? thisYearDate : otherYearDate).format(value)}</span>
            <span className="hidden sm:inline">{longDate.format(value)}</span>
          </span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden rounded-xl p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(d) => d && pick(d)}
          defaultMonth={value}
          disabled={allowFuture ? undefined : { after: today }}
          captionLayout="dropdown"
          startMonth={new Date(today.getFullYear() - 10, 0)}
          endMonth={allowFuture ? new Date(today.getFullYear() + 10, 11) : today}
          weekStartsOn={1}
          autoFocus
          className="[--cell-size:--spacing(9)]"
        />
        <div className="flex gap-2 border-t p-2">
          <Button type="button" size="sm" variant={isSameDay(value, today) ? "default" : "secondary"} className="flex-1" onClick={() => pick(today)}>
            Today
          </Button>
          <Button type="button" size="sm" variant={isSameDay(value, other.date) ? "default" : "secondary"} className="flex-1" onClick={() => pick(other.date)}>
            {other.label}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Hour / minute / AM-PM columns in a popover, in the same style as the calendar.
 * `value` is "HH:MM" (24h). When `maxTime` is set (the picked day is today), later times are disabled.
 */
export function TimePicker({ id, value, onChange, maxTime }: { id: string; value: string; onChange: (v: string) => void; maxTime?: Date | null }) {
  const [open, setOpen] = useState(false);
  const [h24, m] = value.split(":").map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  const minutes = [...new Set([...Array.from({ length: 12 }, (_, i) => i * 5), m])].sort((a, b) => a - b);

  const to24 = (h: number, isPm: boolean) => (h % 12) + (isPm ? 12 : 0);
  const set = (h: number, min: number) => onChange(`${pad(h)}:${pad(min)}`);
  const tooLate = (h: number, min: number) => !!maxTime && h * 60 + min > maxTime.getHours() * 60 + maxTime.getMinutes();
  const label = `${h12}:${pad(m)} ${pm ? "PM" : "AM"}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          className="h-11 w-full justify-start gap-2.5 rounded-lg px-3 text-left text-[15px] font-normal tabular-nums sm:text-[14px]"
        >
          <Clock className="text-muted-foreground" />
          <span className="flex-1">{label}</span>
          <ChevronDown className="text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-auto rounded-xl p-0">
        <div className="flex divide-x">
          <Column label="Hour">
            {HOURS.map((h) => {
              const h24n = to24(h, pm);
              return (
                <Cell key={h} selected={h === h12} disabled={tooLate(h24n, 0)} onClick={() => set(h24n, tooLate(h24n, m) ? 0 : m)}>
                  {h}
                </Cell>
              );
            })}
          </Column>
          <Column label="Min">
            {minutes.map((min) => (
              <Cell key={min} selected={min === m} disabled={tooLate(h24, min)} onClick={() => set(h24, min)}>
                {pad(min)}
              </Cell>
            ))}
          </Column>
          <Column label="">
            {[false, true].map((isPm) => (
              <Cell key={String(isPm)} selected={isPm === pm} disabled={tooLate(to24(h12, isPm), 0)} onClick={() => set(to24(h12, isPm), m)}>
                {isPm ? "PM" : "AM"}
              </Cell>
            ))}
          </Column>
        </div>
        <div className="flex gap-2 border-t p-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              const n = new Date();
              set(n.getHours(), n.getMinutes());
              setOpen(false);
            }}
          >
            Now
          </Button>
          <Button type="button" size="sm" className="flex-1" onClick={() => setOpen(false)}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Column({ label, children }: { label: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  // Centre the selected value when the picker opens (scrolls only this column, not the page).
  useEffect(() => {
    const box = ref.current;
    const el = box?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (box && el) box.scrollTop = el.offsetTop - box.clientHeight / 2 + el.clientHeight / 2;
  }, []);
  return (
    <div className="flex w-16 flex-col">
      <p className="h-8 px-2 pt-2 text-center text-[12px] font-medium text-muted-foreground">{label}</p>
      <div ref={ref} className="no-scrollbar relative flex max-h-56 flex-col gap-0.5 overflow-y-auto p-1.5">
        {children}
      </div>
    </div>
  );
}

function Cell({ selected, disabled, onClick, children }: { selected: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "h-9 shrink-0 rounded-md text-[14px] tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-30",
        selected ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}
