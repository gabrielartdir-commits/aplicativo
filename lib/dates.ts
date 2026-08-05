export interface YearMonth {
  year: number;
  month: number;
}

export function currentYearMonth(now: Date = new Date()): YearMonth {
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

export function previousYearMonth({ year, month }: YearMonth): YearMonth {
  return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
}

const monthFormatter = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  year: "numeric",
});

export function monthLabel({ year, month }: YearMonth): string {
  const label = monthFormatter.format(new Date(year, month - 1, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function nextYearMonth({ year, month }: YearMonth): YearMonth {
  return month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
}

/** Rótulo curto de competência, como "nov/26" — usado no calendário de parcelas. */
export function shortCompetenceLabel({ year, month }: YearMonth): string {
  const names = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  return `${names[month - 1]}/${String(year).slice(2)}`;
}

/**
 * Data de vencimento dentro de uma competência.
 * Um dia 31 num mês de 30 cai no último dia, nunca vaza para o mês seguinte.
 */
export function dueDateInMonth(
  { year, month }: YearMonth,
  day: number
): string {
  const lastDay = new Date(year, month, 0).getDate();
  const safeDay = Math.min(day, lastDay);
  return `${year}-${String(month).padStart(2, "0")}-${String(safeDay).padStart(2, "0")}`;
}

/**
 * Vencimento real da fatura de uma competência.
 *
 * O vencimento vem sempre depois do fechamento. Num cartão que fecha dia 28 e
 * vence dia 10, a fatura de agosto é paga em 10 de setembro — o vencimento cai
 * no mês seguinte. Já num que fecha dia 5 e vence dia 15, os dois caem no
 * mesmo mês.
 */
export function invoiceDueDate(
  competence: YearMonth,
  closingDay: number,
  dueDay: number
): string {
  const target = dueDay > closingDay ? competence : nextYearMonth(competence);
  return dueDateInMonth(target, dueDay);
}

/**
 * Competência da primeira cobrança de uma compra no cartão.
 *
 * Compra feita até o fechamento entra na fatura do próprio mês; feita depois,
 * já pegou a fatura fechada e cai na seguinte.
 */
export function competenceForPurchase(
  purchaseDate: string,
  closingDay: number
): YearMonth {
  const date = new Date(`${purchaseDate}T00:00:00`);
  const competence = { year: date.getFullYear(), month: date.getMonth() + 1 };
  return date.getDate() > closingDay ? nextYearMonth(competence) : competence;
}

/** Verdadeiro quando `a` é uma competência anterior a `b`. */
export function isBeforeCompetence(a: YearMonth, b: YearMonth): boolean {
  return a.year < b.year || (a.year === b.year && a.month < b.month);
}

/** Data local no formato YYYY-MM-DD (coluna `date` do Postgres). */
export function toISODate(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
