import {
  History,
  Lightbulb,
  Receipt,
  Settings,
  Sparkles,
  TrendingUp,
  Wallet,
  LineChart,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

/**
 * Faturas e Assinaturas viraram abas dentro de Gastos Fixos — os três são o
 * mesmo assunto: o que já tem dono antes de qualquer decisão de gasto.
 *
 * Categorias saiu da navegação: continua existindo para o copiloto
 * classificar lançamentos, mas deixou de ser uma tela do dia a dia.
 */
export const navigation: NavItem[] = [
  { label: "Hoje", href: "/", icon: Wallet },
  { label: "Histórico", href: "/historico", icon: History },
  { label: "Gastos Fixos", href: "/gastos-fixos", icon: Receipt },
  { label: "Parcelas", href: "/parcelas", icon: TrendingUp },
  { label: "Progressão", href: "/progressao", icon: LineChart },
  { label: "Investimentos", href: "/investimentos", icon: TrendingUp },
  { label: "Simulações", href: "/simulacoes", icon: Sparkles },
  { label: "Insights", href: "/insights", icon: Lightbulb },
  { label: "Configurações", href: "/configuracoes", icon: Settings },
];
