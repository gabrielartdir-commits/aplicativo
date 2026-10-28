"use server";

/**
 * Retrato financeiro completo, para a consultoria do Claude.
 *
 * A diferença em relação ao contexto dos insights é o alcance: ali era o mês
 * atual mais uma projeção; aqui é o ano inteiro mês a mês, o histórico de
 * faturas, todas as parcelas com data de término e o total investido. É o que
 * permite falar de patrimônio em vez de só do mês.
 *
 * Montado no servidor de propósito: a tela não precisa carregar oito consultas
 * só para mandar tudo de volta, e o retrato fica consistente num só instante.
 */

import { all } from "@/lib/db";
import { round2 } from "@/lib/finance";
import { getAnnualFlow } from "./flow.actions";
import { listActiveFixedExpenses } from "./fixed.actions";
import { listRecurringIncomes } from "./fixed.actions";
import { findLatestOpenMonth } from "./core.actions";
import { listPurchasesWithInstallments, listAllInvoices } from "./cards.actions";
import { listActiveSubscriptions } from "./cards.actions";
import { listAllInvestments } from "./ledger.actions";

/** Quantos meses de gasto variável entram na média. */
const VARIABLE_WINDOW = 6;

export interface FinancialSnapshot {
  gerado_em: string;
  mes_atual: {
    competencia: string;
    saldo_bancario: number;
    disponivel_para_gastar: number;
    salario: number;
    entradas_extras: number;
    reservado: {
      contas_fixas: number;
      faturas: number;
      investimento: number;
    };
  } | null;
  entradas_fixas: { nome: string; valor: number; ativa: boolean }[];
  contas_fixas: { nome: string; valor: number; dia: number }[];
  assinaturas: { nome: string; valor: number; forma: string }[];
  competencia_de_corte: string;
  parcelas_em_andamento: {
    descricao: string;
    valor_parcela: number;
    /** Parcelas da competência de corte em diante. */
    parcelas_a_pagar: number;
    termina_em: string | null;
    total_a_pagar: number;
  }[];
  compromisso_por_mes: { competencia: string; parcelas: number }[];
  faturas: {
    competencia: string;
    cartao: string;
    total: number;
    paga: boolean;
  }[];
  investimentos: { total_acumulado: number; aportes: number };
  fluxo_anual: {
    ano: number;
    meses: {
      mes: number;
      entradas: number;
      saidas: number;
      aportes: number;
      resultado: number;
      saldo_final: number | null;
    }[];
    totais: { entradas: number; saidas: number; aportes: number };
  }[];
  media_gastos_variaveis: number;
}

/**
 * Soma das parcelas por competência, da competência atual para frente — quais
 * meses estão carregados e quando a folga chega.
 *
 * O corte importa: parcelas de competências já pagas inflariam o compromisso
 * futuro e a IA leria folga que não existe (ou aperto que já passou).
 */
function installmentsAhead(
  fromYear: number,
  fromMonth: number
): { competencia: string; parcelas: number }[] {
  const rows = all<{ year: number; month: number; total: number }>(
    `SELECT year, month, SUM(amount) AS total
       FROM card_installments
      WHERE (year * 12 + month) >= (:year * 12 + :month)
      GROUP BY year, month
      ORDER BY year, month`,
    { year: fromYear, month: fromMonth }
  );
  return rows.map((r) => ({
    competencia: `${String(r.month).padStart(2, "0")}/${r.year}`,
    parcelas: round2(Number(r.total)),
  }));
}

/** Média dos gastos variáveis dos últimos meses com movimento. */
function variableAverage(): number {
  const rows = all<{ total: number }>(
    `SELECT SUM(t.amount) AS total
       FROM transactions t
       JOIN months m ON m.id = t.month_id
      WHERE t.type = 'expense'
      GROUP BY m.year, m.month
      ORDER BY m.year DESC, m.month DESC
      LIMIT :limit`,
    { limit: VARIABLE_WINDOW }
  );
  if (rows.length === 0) return 0;
  const sum = rows.reduce((acc, r) => acc + Number(r.total), 0);
  return round2(sum / rows.length);
}

export async function getFinancialSnapshot(): Promise<FinancialSnapshot> {
  const month = await findLatestOpenMonth();

  const [expenses, incomes, subscriptions, purchases, invoices, investments] =
    await Promise.all([
      listActiveFixedExpenses(),
      listRecurringIncomes(),
      listActiveSubscriptions(),
      listPurchasesWithInstallments(),
      listAllInvoices(),
      listAllInvestments(),
    ]);

  // Os anos com movimento, mais o ano corrente — o fluxo de um ano sozinho não
  // mostra tendência.
  const years = all<{ year: number }>(
    "SELECT DISTINCT year FROM months ORDER BY year"
  ).map((r) => Number(r.year));
  const currentYear = new Date().getFullYear();
  if (!years.includes(currentYear)) years.push(currentYear);

  const flows = await Promise.all(years.map((y) => getAnnualFlow(y)));

  // Corte pela competência do mês aberto no app, não pelo calendário: é ela
  // que define o que o app considera "agora".
  const now = new Date();
  const cutYear = month?.year ?? now.getFullYear();
  const cutMonth = month?.month ?? now.getMonth() + 1;
  const cutKey = cutYear * 12 + cutMonth;

  return {
    gerado_em: now.toISOString().slice(0, 10),
    competencia_de_corte: `${String(cutMonth).padStart(2, "0")}/${cutYear}`,

    mes_atual: month
      ? {
          competencia: `${String(month.month).padStart(2, "0")}/${month.year}`,
          saldo_bancario: Number(month.bank_balance),
          disponivel_para_gastar: Number(month.available_balance),
          salario: Number(month.salary),
          entradas_extras: Number(month.extra_income),
          reservado: {
            contas_fixas: Number(month.reserved_fixed_expenses),
            faturas: Number(month.reserved_invoices),
            investimento: Number(month.reserved_investment),
          },
        }
      : null,

    entradas_fixas: incomes.map((i) => ({
      nome: i.name,
      valor: Number(i.amount),
      ativa: i.active,
    })),

    contas_fixas: expenses.map((e) => ({
      nome: e.name,
      valor: Number(e.amount),
      dia: e.due_day,
    })),

    assinaturas: subscriptions.map((s) => ({
      nome: s.name,
      valor: Number(s.amount),
      forma: s.payment_method,
    })),

    parcelas_em_andamento: purchases
      .map((p) => {
        const ahead = p.installments.filter(
          (i) => i.year * 12 + i.month >= cutKey
        );
        const last = ahead[ahead.length - 1];
        return {
          descricao: p.description,
          valor_parcela: round2(
            Number(p.total_amount) / p.installments_count
          ),
          parcelas_a_pagar: ahead.length,
          termina_em: last
            ? `${String(last.month).padStart(2, "0")}/${last.year}`
            : null,
          total_a_pagar: round2(
            ahead.reduce((acc, i) => acc + Number(i.amount), 0)
          ),
          // Só para ordenar — "MM/AAAA" como texto põe 01/2027 antes de 09/2026.
          fim: last ? last.year * 12 + last.month : 0,
        };
      })
      .filter((p) => p.parcelas_a_pagar > 0)
      .sort((a, b) => a.fim - b.fim)
      .map((p) => ({
        descricao: p.descricao,
        valor_parcela: p.valor_parcela,
        parcelas_a_pagar: p.parcelas_a_pagar,
        termina_em: p.termina_em,
        total_a_pagar: p.total_a_pagar,
      })),

    compromisso_por_mes: installmentsAhead(cutYear, cutMonth),

    faturas: invoices.map((i) => ({
      competencia: `${String(i.month).padStart(2, "0")}/${i.year}`,
      cartao: i.card?.name ?? "cartão",
      total: Number(i.total),
      paga: i.paid,
    })),

    investimentos: {
      total_acumulado: round2(
        investments.reduce((acc, i) => acc + Number(i.amount), 0)
      ),
      aportes: investments.length,
    },

    fluxo_anual: flows.map((f) => ({
      ano: f.year,
      meses: f.months
        .filter((m) => m.opened || m.inflow > 0 || m.outflow > 0)
        .map((m) => ({
          mes: m.month,
          entradas: m.inflow,
          saidas: m.outflow,
          aportes: m.invested,
          resultado: m.net,
          saldo_final: m.endingBalance,
        })),
      totais: {
        entradas: f.totals.inflow,
        saidas: f.totals.outflow,
        aportes: f.totals.invested,
      },
    })),

    media_gastos_variaveis: variableAverage(),
  };
}
