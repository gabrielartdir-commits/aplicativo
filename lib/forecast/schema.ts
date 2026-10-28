/**
 * O padrão da planilha de "Próximos meses".
 *
 * Este arquivo é a única fonte da verdade do formato: o modelo que o app
 * oferece para baixar e o leitor que recebe o arquivo preenchido saem os dois
 * daqui. Mexer numa coluna aqui muda os dois lados de uma vez.
 *
 * O leitor é tolerante de propósito — a planilha é preenchida à mão:
 *
 *   * a ordem das colunas não importa, o cabeçalho é reconhecido pelo nome
 *     (sem acento, sem maiúscula, sem espaço sobrando);
 *   * cada coluna aceita mais de um nome ("Descrição" ou "Item", "Valor" ou
 *     "Previsto");
 *   * a competência pode vir numa coluna só ("11/2026", "nov/26", uma data
 *     do Excel) ou em duas ("Ano" e "Mês", com o mês por número ou por nome);
 *   * valor aceita 1234.56, "1.234,56" e "R$ 1.234,56";
 *   * linha em branco é ignorada, não é erro.
 */

import type { ForecastKind, ForecastStatus } from "@/types/forecast";

/** Nome da aba que o leitor procura. Não achando, lê a primeira. */
export const SHEET_NAME = "Lançamentos";
export const INSTRUCTIONS_SHEET = "Como preencher";
export const EXAMPLE_SHEET = "Exemplo";

/** Quantas linhas do modelo já vêm com as listas de validação prontas. */
export const TEMPLATE_ROWS = 400;

export type ColumnId =
  | "competence"
  | "year"
  | "month"
  | "kind"
  | "group"
  | "name"
  | "amount"
  | "status"
  | "method"
  | "notes";

export interface ColumnSpec {
  id: ColumnId;
  /** Cabeçalho escrito no modelo. */
  header: string;
  /** Outros nomes aceitos na leitura (já normalizados). */
  aliases: string[];
  width: number;
  /** Entra no modelo em branco que o app gera. */
  inTemplate: boolean;
  money?: boolean;
  /** Lista fechada de valores, que vira validação de célula no Excel. */
  list?: string[];
  help: string;
}

export const COLUMNS: ColumnSpec[] = [
  {
    id: "competence",
    header: "Competência",
    aliases: ["competencia", "mes/ano", "mes ano", "periodo", "referencia"],
    width: 14,
    inTemplate: true,
    help: 'Mês a que o gasto pertence, como "11/2026". Dá para arrastar a célula para baixo e repetir no mês inteiro. Se preferir, use duas colunas, "Ano" e "Mês", no lugar desta.',
  },
  {
    id: "year",
    header: "Ano",
    aliases: ["ano"],
    width: 8,
    inTemplate: false,
    help: "Alternativa à Competência, junto com a coluna Mês.",
  },
  {
    id: "month",
    header: "Mês",
    aliases: ["mes"],
    width: 10,
    inTemplate: false,
    help: 'Alternativa à Competência: número de 1 a 12, ou o nome do mês ("novembro", "nov").',
  },
  {
    id: "kind",
    header: "Tipo",
    aliases: ["tipo", "natureza", "entrada/saida"],
    width: 11,
    inTemplate: true,
    list: ["saída", "entrada"],
    help: 'Em branco vale como gasto. Escreva "entrada" quando a linha for dinheiro entrando (salário, freela, reembolso).',
  },
  {
    id: "group",
    header: "Grupo",
    aliases: ["grupo", "categoria", "classificacao", "tipo de gasto"],
    width: 20,
    inTemplate: true,
    help: 'Como você quer ver os gastos somados no gráfico: "Moradia", "Carro", "Cartão", "Filhos". Texto livre — use sempre o mesmo nome para o mesmo grupo.',
  },
  {
    id: "name",
    header: "Descrição",
    aliases: ["descricao", "item", "nome", "lancamento", "gasto", "despesa"],
    width: 34,
    inTemplate: true,
    help: "Obrigatório. O que é esse gasto.",
  },
  {
    id: "amount",
    header: "Valor",
    aliases: ["valor", "previsto", "valor previsto", "total", "r$"],
    width: 14,
    inTemplate: true,
    money: true,
    help: "Obrigatório. Só o número, positivo. Linha sem valor fechado pode ficar em 0.",
  },
  {
    id: "status",
    header: "Status",
    aliases: ["status", "situacao"],
    width: 13,
    inTemplate: true,
    list: ["previsto", "confirmado", "pago"],
    help: 'Em branco vale "previsto". Serve só para você saber o que já está fechado.',
  },
  {
    id: "method",
    header: "Forma",
    aliases: ["forma", "forma de pagamento", "pagamento", "meio", "origem"],
    width: 16,
    inTemplate: true,
    help: 'Opcional: "débito", "pix", "cartão Nubank", "boleto".',
  },
  {
    id: "notes",
    header: "Observação",
    aliases: ["observacao", "obs", "nota", "notas", "comentario"],
    width: 30,
    inTemplate: true,
    help: "Opcional. Qualquer anotação sobre a linha.",
  },
];

/** Colunas que o modelo em branco traz, na ordem. */
export const TEMPLATE_COLUMNS = COLUMNS.filter((c) => c.inTemplate);

/** minúsculas, sem acento, sem espaço sobrando — para comparar cabeçalhos. */
export function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Qual coluna do padrão corresponde a um cabeçalho escrito na planilha. */
export function matchColumn(header: unknown): ColumnId | null {
  const key = normalize(header).replace(/[:.]+$/, "");
  if (key === "") return null;
  for (const column of COLUMNS) {
    if (normalize(column.header) === key) return column.id;
    if (column.aliases.includes(key)) return column.id;
  }
  return null;
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

const KIND_WORDS: Record<string, ForecastKind> = {
  saida: "saida",
  saidas: "saida",
  gasto: "saida",
  gastos: "saida",
  despesa: "saida",
  despesas: "saida",
  custo: "saida",
  pagamento: "saida",
  entrada: "entrada",
  entradas: "entrada",
  receita: "entrada",
  receitas: "entrada",
  ganho: "entrada",
  renda: "entrada",
  credito: "entrada",
};

/** Tipo da linha. Em branco é saída — a tela é de gastos. */
export function parseKind(value: unknown): ForecastKind | null {
  const text = normalize(value);
  if (text === "") return "saida";
  return KIND_WORDS[text] ?? null;
}

const STATUS_WORDS: Record<string, ForecastStatus> = {
  previsto: "previsto",
  prevista: "previsto",
  previsao: "previsto",
  estimado: "previsto",
  confirmado: "confirmado",
  confirmada: "confirmado",
  fechado: "confirmado",
  contratado: "confirmado",
  pago: "pago",
  paga: "pago",
  quitado: "pago",
};

/** Status da linha. Em branco é "previsto". */
export function parseStatus(value: unknown): ForecastStatus | null {
  const text = normalize(value);
  if (text === "") return "previsto";
  return STATUS_WORDS[text] ?? null;
}

/** Rótulo "11/2026" de uma competência. */
export function competenceKey(year: number, month: number): string {
  return `${String(month).padStart(2, "0")}/${year}`;
}
