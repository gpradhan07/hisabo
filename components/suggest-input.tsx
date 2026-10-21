"use client";

import { Check, type LucideIcon } from "lucide-react";
import { createElement, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * A text input with a suggestion dropdown in the same style as the date and time pickers
 * (instead of the browser's own <datalist> list). Typing filters the list; ↑ ↓ Enter and Esc work.
 * Anything typed is accepted, the list only helps.
 */
export function SuggestInput({
  id,
  value,
  onChange,
  suggestions,
  icon,
  placeholder,
  maxLength,
  invalid,
  className,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  /** icon shown next to each suggestion */
  icon?: (s: string) => LucideIcon;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  className?: string;
}) {
  const listId = useId();
  const anchor = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  // Starts-with matches first, then the rest that contain the text.
  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return suggestions;
    const starts = suggestions.filter((s) => s.toLowerCase().startsWith(q));
    const contains = suggestions.filter((s) => !s.toLowerCase().startsWith(q) && s.toLowerCase().includes(q));
    return [...starts, ...contains];
  }, [value, suggestions]);
  const show = open && matches.length > 0;

  const choose = (s: string) => {
    onChange(s);
    setOpen(false);
    setActive(-1);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % Math.max(1, matches.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && show && active >= 0) {
      e.preventDefault(); // pick the suggestion instead of submitting the form
      choose(matches[active]);
    }
  };

  return (
    <Popover open={show} onOpenChange={(o) => !o && setOpen(false)}>
      <PopoverAnchor asChild>
        <div ref={anchor} className={className}>
          <Input
            id={id}
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onClick={() => setOpen(true)}
            onKeyDown={onKeyDown}
            autoComplete="off"
            maxLength={maxLength}
            placeholder={placeholder}
            role="combobox"
            aria-expanded={show}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={show && active >= 0 ? `${listId}-${active}` : undefined}
            aria-invalid={invalid}
            className="h-11 text-[16px] sm:text-[14px]"
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) rounded-xl p-0"
        // keep typing in the input; clicks on the input itself shouldn't close the list
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => anchor.current?.contains(e.target as Node) && e.preventDefault()}
      >
        <ul id={listId} role="listbox" className="no-scrollbar flex max-h-64 flex-col gap-0.5 overflow-y-auto p-1.5">
          {matches.map((s, i) => {
            const selected = s.toLowerCase() === value.trim().toLowerCase();
            return (
              <li
                key={s}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={selected}
                data-active={i === active}
                // mousedown would blur the input first; keep focus, pick on click
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(s)}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex h-9 shrink-0 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-[14px] transition-colors",
                  "data-[active=true]:bg-muted",
                  selected && "font-medium text-brand-ink",
                )}
              >
                {icon && createElement(icon(s), { className: "size-4 shrink-0 text-muted-foreground", "aria-hidden": true })}
                <span className="flex-1 truncate">{s}</span>
                {selected && <Check className="size-4 shrink-0 text-brand" aria-hidden />}
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
