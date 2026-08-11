"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { ArrowUp, Mic, Sparkles, X, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Textarea } from "@/components/ui/textarea";
import type { Month } from "@/types/domain";
import { useAiMessage } from "../hooks/use-ai-message";
import { aiConversationRepository } from "@/services/repositories/ai-conversation-repository";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

export function AiInput({ month }: { month: Month }) {
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<string | null>(null);

  // Mobile layout state
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const ai = useAiMessage();

  // Load chat history for the mobile ChatGPT-style view
  const { data: allMessages } = useQuery({
    queryKey: queryKeys.aiConversations,
    queryFn: () => aiConversationRepository.listRecent(30),
    enabled: true,
  });

  const chatMessages = useMemo(() => {
    return [...(allMessages ?? [])].reverse();
  }, [allMessages]);

  // Scroll to bottom when message or pending state changes in mobile drawer
  useEffect(() => {
    if (mobileChatOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatMessages, ai.isPending, mobileChatOpen]);

  async function send() {
    const trimmed = message.trim();
    if (!trimmed || ai.isPending) return;

    setMessage("");
    setReply(null);

    try {
      const result = await ai.mutateAsync({
        message: trimmed,
        monthId: month.id,
      });
      setReply(result.content);
    } catch {
      // Erro é tratado pelo onError no hook
    }
  }

  return (
    <>
      {/* ==================== LAYOUT DESKTOP ==================== */}
      <section className="mx-auto w-full max-w-[780px] hidden md:block">
        <div className="relative rounded-[18px] border bg-card shadow-[0_1px_2px_rgb(0_0_0/0.35)] transition-all focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/12">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="O que aconteceu hoje?"
            className="min-h-[58px] resize-none border-0 bg-transparent p-4 pr-24 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="absolute right-3 bottom-3 flex items-center gap-1.5">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Entrada por voz (em breve)"
                    className="cursor-not-allowed text-muted-2"
                    onClick={(e) => e.preventDefault()}
                  >
                    <Mic />
                  </Button>
                }
              />
              <TooltipContent>Entrada por voz — em breve</TooltipContent>
            </Tooltip>
            <Button
              size="icon"
              aria-label="Enviar"
              disabled={!message.trim() || ai.isPending}
              onClick={send}
              className="rounded-[12px]"
            >
              <ArrowUp />
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {(ai.isPending || reply) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="mt-3 flex items-start gap-3 rounded-[14px] border border-primary/15 bg-primary/5 px-4 py-3.5">
                <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
                {ai.isPending ? (
                  <p className="flex items-center gap-1 py-1">
                    <span className="size-1.5 animate-bounce rounded-full bg-primary/70" />
                    <span
                      className="size-1.5 animate-bounce rounded-full bg-primary/70"
                      style={{ animationDelay: "150ms" }}
                    />
                    <span
                      className="size-1.5 animate-bounce rounded-full bg-primary/70"
                      style={{ animationDelay: "300ms" }}
                    />
                  </p>
                ) : (
                  <>
                    <p className="flex-1 text-sm leading-relaxed whitespace-pre-line">
                      {reply}
                    </p>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Dispensar resposta"
                      onClick={() => setReply(null)}
                      className="text-muted-foreground"
                    >
                      <X />
                    </Button>
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* ==================== LAYOUT MOBILE (FAB + DRAWER CHAT) ==================== */}
      {/* Floating Action Button (FAB) */}
      <button
        onClick={() => setMobileChatOpen(true)}
        aria-label="Abrir Copiloto Financeiro"
        className="fixed bottom-24 right-4 z-40 md:hidden flex items-center justify-center size-14 rounded-full bg-emerald-500 text-background shadow-xl hover:bg-emerald-400 active:scale-90 transition-all border border-background/10"
      >
        <MessageSquare className="size-6 text-background fill-background/20" />
      </button>

      {/* Slide-up ChatGPT-style Chat Drawer */}
      <AnimatePresence>
        {mobileChatOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileChatOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            />
            {/* Bottom Drawer */}
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="fixed inset-x-0 bottom-0 z-50 h-[88vh] rounded-t-[28px] bg-background border-t border-border/20 shadow-2xl flex flex-col overflow-hidden md:hidden"
            >
              {/* Drag indicator handle & Header */}
              <div className="px-5 pt-3 pb-2 flex flex-col items-center shrink-0 border-b border-border/10">
                <div className="w-12 h-1 rounded-full bg-muted/40 mb-3" />
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2">
                    <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Sparkles className="size-4" />
                    </span>
                    <h3 className="font-bold text-sm text-foreground">Copiloto IA</h3>
                  </div>
                  <button
                    onClick={() => setMobileChatOpen(false)}
                    className="text-muted-foreground hover:text-foreground p-1"
                  >
                    <X className="size-5" />
                  </button>
                </div>
              </div>

              {/* Message Feed Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-none [scrollbar-width:none]">
                {chatMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-4">
                    <Sparkles className="size-10 text-primary animate-pulse" />
                    <h4 className="font-bold text-sm">Olá! Eu sou seu Copiloto IA</h4>
                    <p className="text-xs text-muted-foreground max-w-[260px] leading-relaxed">
                      Lance despesas ou faça perguntas sobre o orçamento. Experimente as sugestões:
                    </p>
                    <div className="flex flex-col gap-2 w-full max-w-[280px] pt-2">
                      {[
                        "Gastei R$ 45 no almoço",
                        "Recebi pix extra de R$ 150",
                        "Quanto resta na categoria Lazer?",
                      ].map((hint) => (
                        <button
                          key={hint}
                          onClick={() => setMessage(hint)}
                          className="w-full text-left text-xs rounded-2xl border border-border/40 bg-card p-3 active:bg-accent/40 font-semibold text-foreground/80 hover:text-foreground transition-all"
                        >
                          {hint}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  chatMessages.map((msg) => {
                    const isUser = msg.role === "user";
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex w-full",
                          isUser ? "justify-end" : "justify-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[85%] rounded-[20px] px-4 py-3 text-xs leading-relaxed shadow-sm",
                            isUser
                              ? "bg-primary text-primary-foreground rounded-tr-none font-medium"
                              : "bg-accent/30 text-foreground border border-border/20 rounded-tl-none whitespace-pre-line"
                          )}
                        >
                          {msg.content}
                        </div>
                      </div>
                    );
                  })
                )}

                {/* Bouncing Dots Loading Bubble */}
                {ai.isPending && (
                  <div className="flex justify-start">
                    <div className="bg-accent/30 border border-border/20 rounded-[20px] rounded-tl-none px-4 py-3 shadow-sm">
                      <p className="flex items-center gap-1 py-0.5">
                        <span className="size-1.5 animate-bounce rounded-full bg-primary/70" />
                        <span
                          className="size-1.5 animate-bounce rounded-full bg-primary/70"
                          style={{ animationDelay: "150ms" }}
                        />
                        <span
                          className="size-1.5 animate-bounce rounded-full bg-primary/70"
                          style={{ animationDelay: "300ms" }}
                        />
                      </p>
                    </div>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area (ChatGPT Style) */}
              <div className="p-4 border-t border-border/10 bg-background pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
                <div className="relative rounded-[20px] border bg-card p-1 shadow-inner focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/12 flex items-end">
                  <Textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                    placeholder="Pergunte ao BudgetOS..."
                    rows={1}
                    className="flex-1 min-h-[44px] max-h-[100px] resize-none border-0 bg-transparent p-3 pr-12 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
                  />
                  <button
                    disabled={!message.trim() || ai.isPending}
                    onClick={send}
                    aria-label="Enviar mensagem"
                    className="absolute right-2 bottom-2 size-9 rounded-[14px] bg-primary text-primary-foreground hover:bg-primary/95 flex items-center justify-center active:scale-90 disabled:opacity-40 disabled:scale-100 transition-all"
                  >
                    <Send className="size-4 text-primary-foreground" />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
