import { useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  hint?: string; // small muted text shown after the label (e.g. state)
}

/**
 * Searchable, scrollable single-select dropdown styled to match the UI kit.
 * Handles large option lists by only rendering matches (capped at `maxResults`).
 */
export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  clearLabel,
  className,
  maxResults = 100,
}: {
  options: ComboboxOption[];
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  clearLabel?: string; // when set, shows a top item that clears the selection
  className?: string;
  maxResults?: number;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? options.filter(
          (o) =>
            o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q),
        )
      : options;
    return matches.slice(0, maxResults);
  }, [options, query, maxResults]);

  const total = query.trim()
    ? options.filter(
        (o) =>
          o.label.toLowerCase().includes(query.trim().toLowerCase()) ||
          o.hint?.toLowerCase().includes(query.trim().toLowerCase()),
      ).length
    : options.length;

  const pick = (v: string | undefined) => {
    onChange(v);
    setOpen(false);
    setQuery("");
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-9 items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background transition-colors hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-ring",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? selected.label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[220px] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
        >
          <div className="flex items-center border-b px-3">
            <Search className="h-4 w-4 shrink-0 opacity-50" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && filtered[0]) {
                  e.preventDefault();
                  pick(filtered[0].value);
                }
              }}
              placeholder={searchPlaceholder}
              className="h-9 w-full bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-64 overflow-y-auto p-1">
            {clearLabel && (
              <button
                type="button"
                onClick={() => pick(undefined)}
                className="flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <span className="flex items-center gap-2">
                  <X className="h-3.5 w-3.5" /> {clearLabel}
                </span>
                {value === undefined && <Check className="h-4 w-4" />}
              </button>
            )}

            {filtered.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
            ) : (
              filtered.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => pick(o.value)}
                  className="flex w-full items-center justify-between gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <span className="truncate">
                    {o.label}
                    {o.hint && <span className="ml-1.5 text-xs text-muted-foreground">· {o.hint}</span>}
                  </span>
                  {o.value === value && <Check className="h-4 w-4 shrink-0" />}
                </button>
              ))
            )}

            {total > filtered.length && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                Showing {filtered.length} of {total.toLocaleString()} — keep typing to narrow
              </div>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
