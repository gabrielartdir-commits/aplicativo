/**
 * Leitura de valores de célula — o lado tolerante da planilha.
 *
 * A planilha é preenchida à mão, então nada aqui exige formato exato: cada
 * função aceita as várias formas em que um humano escreve a mesma coisa e
 * devolve `null` quando não dá para entender (o chamador transforma isso em
 * mensagem de erro com o número da linha).
 *
 * Herdado do primeiro leitor de planilha do app e isolado aqui para o
 * `./schema.ts` (o padrão das abas) e o `./read.ts` usarem o mesmo código.
 */

/** minúsculas, sem acento, sem espaço sobrando — para comparar cabeçalhos. */
export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}


const MONTH_NAMES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** Nome do mês por número (1–12), em português. */
export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/** Número do mês a partir de 1–12, "novembro", "nov" ou "Nov.". */
export function parseMonth(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const n = Math.trunc(value);
    return n >= 1 && n <= 12 ? n : null;
  }

  // normalize já tirou os acentos, então os nomes também perdem os deles.
  const target = normalize(value).replace(/\.$/, "");
  if (/^\d{1,2}$/.test(target)) {
    const n = Number(target);
    return n >= 1 && n <= 12 ? n : null;
  }

  const index = MONTH_NAMES.findIndex((name) => {
    const plain = normalize(name);
    return plain === target || (target.length >= 3 && plain.startsWith(target));
  });
  return index === -1 ? null : index + 1;
}

/** Ano de 2 ou 4 dígitos. 26 vira 2026. */
export function parseYear(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const text = normalize(value);
  if (!/^\d{2}(\d{2})?$/.test(text)) return null;
  const n = Number(text);
  const year = n < 100 ? 2000 + n : n;
  return year >= 2000 && year <= 2200 ? year : null;
}

/**
 * Competência escrita numa célula só: "11/2026", "11/26", "nov/26",
 * "novembro 2026", "2026-11" ou uma data de verdade do Excel.
 */
export function parseCompetence(
  value: unknown
): { year: number; month: number } | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return { year: value.getFullYear(), month: value.getMonth() + 1 };
  }

  const text = normalize(value);

  // 2026-11 / 2026/11
  const iso = text.match(/^(\d{4})[-/](\d{1,2})$/);
  if (iso) {
    const month = Number(iso[2]);
    const year = Number(iso[1]);
    return month >= 1 && month <= 12 ? { year, month } : null;
  }

  // 11/2026, 11-26, nov/26, novembro 2026
  const pair = text.match(/^([^\s/\-.]+)[\s/\-.]+(\d{2,4})$/);
  if (pair) {
    const month = parseMonth(pair[1]);
    const year = parseYear(pair[2]);
    if (month && year) return { year, month };
  }

  return null;
}

/** Valor em reais: 1234.56, "1.234,56", "R$ 1.234,56", "(50)" negativo. */
export function parseAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  let text = String(value).trim();
  if (text === "") return null;

  // Parênteses são negativo em planilha contábil.
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()]/g, "").replace(/^-/, "");
  text = text.replace(/r\$/i, "").replace(/[\s ]/g, "");

  // Com os dois separadores presentes, o último é o decimal.
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  if (lastComma !== -1 && lastDot !== -1) {
    const decimal = lastComma > lastDot ? "," : ".";
    const thousand = decimal === "," ? "." : ",";
    text = text.split(thousand).join("").replace(decimal, ".");
  } else if (lastComma !== -1) {
    // Só vírgula: é decimal, a não ser que separe milhar ("1,234").
    text = /^\d{1,3}(,\d{3})+$/.test(text)
      ? text.split(",").join("")
      : text.replace(",", ".");
  }

  const parsed = Number(text);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -parsed : parsed;
}

/** Rótulo "11/2026" de uma competência. */
export function competenceKey(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}

/** Dia do mês (1–31), para vencimento, fechamento e cobrança. */
export function parseDay(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getDate();
  const text = normalize(value).replace(/^dia\s*/, "").replace(/[^\d]/g, "");
  if (text === "") return null;
  const n = Number(text);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
}

const TRUE_WORDS = new Set([
  "sim",
  "s",
  "x",
  "true",
  "verdadeiro",
  "1",
  "ativo",
  "ativa",
  "pago",
  "paga",
  "ok",
]);
const FALSE_WORDS = new Set([
  "nao",
  "n",
  "false",
  "falso",
  "0",
  "inativo",
  "inativa",
  "pendente",
  "aberto",
  "-",
]);

/**
 * Coluna de sim/não. Em branco devolve o padrão informado — "Ativo" em
 * branco é ativo, "Pago" em branco é não pago, e quem sabe disso é a coluna.
 */
export function parseBool(value: unknown, fallback: boolean): boolean | null {
  if (typeof value === "boolean") return value;
  const text = normalize(value);
  if (text === "") return fallback;
  if (TRUE_WORDS.has(text)) return true;
  if (FALSE_WORDS.has(text)) return false;
  return null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Data de um lançamento, sempre devolvida como `aaaa-mm-dd`.
 *
 * Aceita a data do Excel, "15/11/2026", "15/11", "2026-11-15" e só o dia
 * ("15") — nos três últimos casos o mês e o ano saem da competência da
 * planilha, que é o que o Gabriel tem em mente ao escrever só o dia.
 */
export function parseDate(
  value: unknown,
  competence: { year: number; month: number }
): string | null {
  if (value === null || value === undefined || value === "") return null;

  if (value instanceof Date) {
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }

  const text = normalize(value);

  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const month = Number(iso[2]);
    const day = Number(iso[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${iso[1]}-${pad(month)}-${pad(day)}`;
  }

  // dd/mm/aaaa, dd/mm/aa, dd-mm
  const br = text.match(/^(\d{1,2})[/\-.](\d{1,2})(?:[/\-.](\d{2,4}))?$/);
  if (br) {
    const day = Number(br[1]);
    const month = Number(br[2]);
    const year = br[3] ? parseYear(br[3]) : competence.year;
    if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${pad(month)}-${pad(day)}`;
  }

  // Só o dia: completa com a competência da planilha.
  const day = parseDay(text);
  if (day !== null && /^\d{1,2}$/.test(text)) {
    return `${competence.year}-${pad(competence.month)}-${pad(day)}`;
  }

  return null;
}

const EXPENSE_WORDS = new Set([
  "gasto",
  "gastos",
  "saida",
  "saidas",
  "despesa",
  "despesas",
  "custo",
  "pagamento",
  "compra",
]);
const INCOME_WORDS = new Set([
  "receita",
  "receitas",
  "entrada",
  "entradas",
  "ganho",
  "renda",
  "credito",
  "reembolso",
  "salario",
]);

/** Tipo de um lançamento. Em branco é gasto — a planilha é de gastos. */
export function parseTransactionKind(
  value: unknown
): "expense" | "income" | null {
  const text = normalize(value);
  if (text === "") return "expense";
  if (EXPENSE_WORDS.has(text)) return "expense";
  if (INCOME_WORDS.has(text)) return "income";
  return null;
}

/** Forma de pagamento de uma assinatura. Em branco é crédito. */
export function parsePaymentMethod(
  value: unknown
): "credit" | "debit" | null {
  const text = normalize(value);
  if (text === "") return "credit";
  if (/^(credito|cartao|cartao de credito|credit)$/.test(text)) return "credit";
  if (/^(debito|debito automatico|conta|debit|pix|boleto)$/.test(text)) {
    return "debit";
  }
  return null;
}

const ADJUSTMENT_WORDS: Record<
  string,
  "entry" | "exit" | "correction" | "transfer"
> = {
  entrada: "entry",
  entry: "entry",
  credito: "entry",
  saida: "exit",
  exit: "exit",
  debito: "exit",
  correcao: "correction",
  correction: "correction",
  ajuste: "correction",
  transferencia: "transfer",
  transfer: "transfer",
};

/** Tipo de ajuste de saldo. Em branco é correção. */
export function parseAdjustmentType(
  value: unknown
): "entry" | "exit" | "correction" | "transfer" | null {
  const text = normalize(value);
  if (text === "") return "correction";
  return ADJUSTMENT_WORDS[text] ?? null;
}
