"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Emojis organizados pelos contextos que aparecem num orçamento mensal.
 * Lista curada de propósito: um seletor completo de emoji vira uma busca
 * dentro de milhares de opções, quando o que se quer é reconhecer a
 * categoria de relance.
 */
const EMOJI_GROUPS: { label: string; emojis: string[] }[] = [
  {
    label: "Alimentação",
    emojis: ["🍔", "🍕", "🍱", "🛒", "☕", "🍺", "🥗", "🍎", "🧁", "🍦"],
  },
  {
    label: "Transporte",
    emojis: ["🚗", "⛽", "🚌", "🚕", "🚲", "🛵", "✈️", "🅿️", "🔧", "🛣️"],
  },
  {
    label: "Moradia",
    emojis: ["🏠", "💡", "💧", "🔥", "🛋️", "🧹", "🔨", "📶", "🪑", "🧺"],
  },
  {
    label: "Saúde",
    emojis: ["💊", "🏥", "🩺", "🦷", "🧠", "💪", "🧘", "👓", "🩹", "🧴"],
  },
  {
    label: "Lazer",
    emojis: ["🎬", "🎮", "🎧", "🏖️", "🎭", "📚", "🎨", "⚽", "🎸", "🍿"],
  },
  {
    label: "Pessoal",
    emojis: ["👕", "👟", "💇", "💅", "🎁", "🐶", "🐱", "📱", "💻", "🧸"],
  },
  {
    label: "Dinheiro",
    emojis: ["💰", "💳", "🏦", "📈", "🧾", "💸", "🎯", "🔒", "📊", "🪙"],
  },
  {
    label: "Trabalho e estudo",
    emojis: ["💼", "🎓", "✏️", "🖨️", "📎", "🗂️", "🛠️", "🚀", "🧑‍💻", "📅"],
  },
];

interface EmojiPickerProps {
  value: string;
  onChange: (emoji: string) => void;
  id?: string;
}

export function EmojiPicker({ value, onChange, id }: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou no Escape, como qualquer menu suspenso.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(emoji: string) {
    onChange(emoji);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Escolher emoji da categoria"
        className={cn(
          "flex h-9 w-full items-center justify-center gap-1 rounded-[10px] border bg-transparent text-lg transition-colors",
          "hover:bg-accent/30 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:outline-none",
          open && "border-primary/40"
        )}
      >
        {value ? (
          <span className="leading-none">{value}</span>
        ) : (
          <Ban className="size-4 text-muted-2" />
        )}
        <ChevronDown className="size-3 text-muted-foreground" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Emojis"
          className="absolute left-0 top-full z-50 mt-1.5 max-h-[280px] w-[min(304px,calc(100vw-3rem))] overflow-y-auto rounded-[16px] border bg-popover p-3 shadow-xl [scrollbar-width:thin]"
        >
          <button
            type="button"
            onClick={() => pick("")}
            className={cn(
              "mb-2 flex w-full items-center gap-2 rounded-[10px] border border-border/40 px-2.5 py-2 text-xs font-semibold transition-colors",
              value === ""
                ? "border-primary/30 bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
            )}
          >
            <Ban className="size-3.5" />
            Sem emoji
          </button>

          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <p className="mb-1 px-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                {group.label}
              </p>
              <div className="grid grid-cols-5 gap-1">
                {group.emojis.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => pick(emoji)}
                    aria-label={emoji}
                    className={cn(
                      "flex h-9 items-center justify-center rounded-[10px] text-lg transition-all active:scale-90",
                      value === emoji
                        ? "bg-primary/15 ring-1 ring-primary/40"
                        : "hover:bg-accent/40"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
