"use client";

import { cn } from "@/lib/utils";

interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}

/**
 * Abas simples em forma de pílulas. Rola na horizontal quando não cabe,
 * sem nunca dar rolagem lateral à página.
 */
export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto rounded-[14px] bg-accent/15 p-1 [scrollbar-width:none]",
        className
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-[10px] px-3.5 py-2 text-xs font-semibold transition-all active:scale-[0.97]",
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-foreground/10"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item.label}
            {item.count !== undefined && item.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] tabular-nums",
                  active
                    ? "bg-primary/15 text-primary"
                    : "bg-accent/40 text-muted-foreground"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
