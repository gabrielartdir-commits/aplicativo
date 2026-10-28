import "server-only";

/**
 * Projeção dos próximos 12 meses.
 *
 * Não existe previsão guardada em tabela: a tela é calculada, toda vez, a
 * partir do cadastro que o app já tem. São quatro parcelas somadas por mês:
 *
 *   fixos        contas fixas ativas — o mesmo valor todo mês
 *   assinaturas  assinaturas ativas, respeitando o mês em que começaram
 *   parcelas     as parcelas de cartão que caem naquela competência, que é a
 *                parte que DIMINUI com o tempo (é o que faz a projeção ter
 *                graça: dá para ver o mês em que o cartão alivia)
 *   variáveis    a média do que foi gasto por mês nos meses já vividos
 *
 * Fatura de cartão não entra como linha própria de propósito: ela é composta
 * pelas parcelas e pelas assinaturas no crédito, e somá-la contaria o mesmo
 * compromisso duas vezes — o mesmo cuidado que `lib/finance` toma na reserva.
 *
 * A média é o único palpite da tela, então ela vem com os meses que a
 * compuseram: um número assim precisa ser auditável.
 */

import { all } from "@/lib/db";
import { round2 } from "@/lib/finance";
import { nextYearMonth, shortCompetenceLabel } from "@/lib/dates";
import type {
  ForecastAverage,
  ForecastItem,
  ForecastMonth,
  ForecastProjection,
} from "@/types/forecast";

/** Quantos meses à frente a tela desenha. */
const HORIZON = 12;
/** Quantos meses já vividos entram na média dos variáveis. */
const AVERAGE_WINDOW = 6;

interface MonthRow {
  id: string;
  year: number;
  month: number;
  closed: number;
}

/** Ordem cronológica de competências. */
const order = (row: { year: number; month: number }) => row.year * 12 + row.month;

function emptyAverage(): ForecastAverage {
  return { value: 0, monthsUsed: 0, perMonth: [], partial: false };
}

/**
 * Média mensal dos gastos variáveis.
 *
 * Usa os meses ANTERIORES ao mês em andamento: incluir um mês que ainda não
 * acabou puxa a média para baixo e a projeção inteira sai otimista. Só quando
 * não há nenhum mês concluído a média cai no mês corrente — e aí `partial`
 * avisa a tela para dizer isso em voz alta.
 */
function variableAverage(
  months: MonthRow[],
  current: { year: number; month: number } | null
): ForecastAverage {
  if (months.length === 0) return emptyAverage();

  const spendByMonth = new Map(
    all<{ month_id: string; total: number }>(
      `SELECT month_id, SUM(amount) AS total FROM transactions
        WHERE type = 'expense' GROUP BY month_id`
    ).map((row) => [row.month_id, Number(row.total)])
  );

  const limit = current ? order(current) : Infinity;

  /*
   * Mês sem nenhum gasto lançado fica fora da média.
   *
   * Zero ali quase nunca quer dizer "não gastei nada": quer dizer que aquele
   * mês não foi lançado. Incluí-lo derruba a média, e numa projeção de gastos
   * errar para baixo é o erro que machuca — a tela diria que sobra dinheiro
   * que não existe.
   */
  const withSpend = months.filter((row) => (spendByMonth.get(row.id) ?? 0) > 0);
  const concluded = withSpend.filter((row) => order(row) < limit);
  const partial = concluded.length === 0;
  const pool = (partial ? withSpend : concluded)
    .sort((a, b) => order(b) - order(a))
    .slice(0, AVERAGE_WINDOW);

  if (pool.length === 0) return emptyAverage();

  const perMonth = pool
    .sort((a, b) => order(a) - order(b))
    .map((row) => ({
      competence: shortCompetenceLabel({ year: row.year, month: row.month }),
      total: round2(spendByMonth.get(row.id) ?? 0),
    }));

  const sum = perMonth.reduce((total, item) => total + item.total, 0);
  return {
    value: round2(sum / perMonth.length),
    monthsUsed: perMonth.length,
    perMonth,
    partial,
  };
}

export async function buildProjection(): Promise<ForecastProjection> {
  const months = all<MonthRow>(
    "SELECT id, year, month, closed FROM months ORDER BY year, month"
  );

  // Mês em andamento: o aberto mais recente, como no resto do app.
  const open = months.filter((row) => !row.closed).sort((a, b) => order(b) - order(a))[0];
  const latest = months[months.length - 1];
  const reference = open ?? latest ?? null;

  const average = variableAverage(months, reference);

  const fixed = all<{ name: string; amount: number; due_day: number }>(
    `SELECT name, amount, due_day FROM fixed_expenses
      WHERE active = 1 ORDER BY due_day, name`
  );
  const fixedTotal = round2(
    fixed.reduce((sum, row) => sum + Number(row.amount), 0)
  );

  const subscriptions = all<{
    name: string;
    amount: number;
    billing_day: number;
    payment_method: string;
    start_year: number | null;
    start_month: number | null;
    card_name: string | null;
  }>(
    `SELECT s.name, s.amount, s.billing_day, s.payment_method,
            s.start_year, s.start_month, c.name AS card_name
       FROM subscriptions s
       LEFT JOIN credit_cards c ON c.id = s.card_id
      WHERE s.active = 1
      ORDER BY s.billing_day, s.name`
  );

  const installments = all<{
    year: number;
    month: number;
    amount: number;
    installment_no: number;
    installments_count: number;
    description: string;
    card_name: string;
  }>(
    `SELECT i.year, i.month, i.amount, i.installment_no,
            p.installments_count, p.description, c.name AS card_name
       FROM card_installments i
       JOIN card_purchases p ON p.id = i.purchase_id
       JOIN credit_cards c ON c.id = p.card_id
      ORDER BY i.year, i.month, p.description`
  );

  const incomeTotal = round2(
    Number(
      all<{ total: number }>(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM recurring_incomes WHERE active = 1"
      )[0]?.total ?? 0
    )
  );

  if (!reference) {
    return {
      start: null,
      months: [],
      average,
      totals: { saidas: 0, entradas: 0, saldo: 0 },
      monthly: {
        fixos: fixedTotal,
        assinaturas: round2(
          subscriptions.reduce((sum, row) => sum + Number(row.amount), 0)
        ),
        variaveis: average.value,
        entradas: incomeTotal,
      },
      lastInstallment: null,
    };
  }

  // A projeção começa no mês SEGUINTE ao que está em andamento: o mês corrente
  // já é a tela "Hoje", e aqui a pergunta é o que vem depois dele.
  const start = nextYearMonth({
    year: reference.year,
    month: reference.month,
  });

  const list: ForecastMonth[] = [];
  let cursor = start;
  let acumulado = 0;

  for (let step = 0; step < HORIZON; step++) {
    const items: ForecastItem[] = [];

    for (const row of fixed) {
      items.push({
        part: "fixos",
        label: row.name,
        detail: `vence dia ${row.due_day}`,
        amount: round2(Number(row.amount)),
      });
    }

    let subscriptionsTotal = 0;
    for (const row of subscriptions) {
      // Assinatura que só começa depois não entra nos meses anteriores a ela.
      if (row.start_year && row.start_month) {
        const started =
          order({ year: row.start_year, month: row.start_month }) <= order(cursor);
        if (!started) continue;
      }
      const amount = round2(Number(row.amount));
      subscriptionsTotal += amount;
      items.push({
        part: "assinaturas",
        label: row.name,
        detail:
          row.payment_method === "credit"
            ? `crédito${row.card_name ? ` · ${row.card_name}` : ""}`
            : "débito",
        amount,
      });
    }

    let installmentsTotal = 0;
    for (const row of installments) {
      if (row.year !== cursor.year || row.month !== cursor.month) continue;
      const amount = round2(Number(row.amount));
      installmentsTotal += amount;
      items.push({
        part: "parcelas",
        label: row.description,
        detail: `${row.installment_no}/${row.installments_count} · ${row.card_name}`,
        amount,
      });
    }

    if (average.value > 0) {
      items.push({
        part: "variaveis",
        label: "Gastos variáveis (média)",
        detail:
          average.monthsUsed === 1
            ? "média de 1 mês"
            : `média de ${average.monthsUsed} meses`,
        amount: average.value,
      });
    }

    const saidas = round2(
      fixedTotal + subscriptionsTotal + installmentsTotal + average.value
    );
    const saldo = round2(incomeTotal - saidas);
    acumulado = round2(acumulado + saldo);

    list.push({
      year: cursor.year,
      month: cursor.month,
      competence: shortCompetenceLabel(cursor),
      fixos: fixedTotal,
      assinaturas: round2(subscriptionsTotal),
      parcelas: round2(installmentsTotal),
      variaveis: average.value,
      saidas,
      entradas: incomeTotal,
      saldo,
      acumulado,
      items,
    });

    cursor = nextYearMonth(cursor);
  }

  const horizonEnd = order(list[list.length - 1]);
  const lastInHorizon = installments
    .filter((row) => order(row) <= horizonEnd && order(row) >= order(start))
    .sort((a, b) => order(b) - order(a))[0];

  return {
    start,
    months: list,
    average,
    totals: {
      saidas: round2(list.reduce((sum, item) => sum + item.saidas, 0)),
      entradas: round2(list.reduce((sum, item) => sum + item.entradas, 0)),
      saldo: round2(list.reduce((sum, item) => sum + item.saldo, 0)),
    },
    monthly: {
      fixos: fixedTotal,
      assinaturas: list[0]?.assinaturas ?? 0,
      variaveis: average.value,
      entradas: incomeTotal,
    },
    lastInstallment: lastInHorizon
      ? shortCompetenceLabel({
          year: lastInHorizon.year,
          month: lastInHorizon.month,
        })
      : null,
  };
}
