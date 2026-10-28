import "server-only";

/**
 * Exportação de tudo que está no banco para uma planilha .xlsx.
 *
 * Uma aba por assunto, com os nomes já resolvidos (cartão, categoria, conta)
 * em vez dos ids — a planilha é para ler e conferir fora do app, não para
 * reimportar. Os valores saem como número com formato de moeda, para somar e
 * filtrar direto no Excel.
 */

import ExcelJS from "exceljs";
import { all, get } from "@/lib/db";
import { round2 } from "@/lib/finance";

/** Formato de moeda do Excel para real. */
const MONEY = 'R$ #,##0.00';

const COMPETENCE = (year: number, month: number) =>
  `${String(month).padStart(2, "0")}/${year}`;

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

interface Column {
  header: string;
  key: string;
  width: number;
  /** Aplica formato de moeda e alinha à direita. */
  money?: boolean;
}

/**
 * Cria a aba já formatada: cabeçalho em negrito, painel congelado e a largura
 * de cada coluna. Sem isso a planilha abre com tudo em "####".
 */
function addSheet(
  book: ExcelJS.Workbook,
  name: string,
  columns: Column[],
  rows: Record<string, unknown>[]
): void {
  const sheet = book.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: c.width,
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).alignment = { vertical: "middle" };

  rows.forEach((row) => sheet.addRow(row));

  columns.forEach((column, index) => {
    if (!column.money) return;
    const col = sheet.getColumn(index + 1);
    col.numFmt = MONEY;
    col.alignment = { horizontal: "right" };
  });

  // Filtro no cabeçalho — ordenar por valor ou por mês sem fórmula.
  if (rows.length > 0) {
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: columns.length },
    };
  }
}

export async function buildWorkbook(): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const book = new ExcelJS.Workbook();
  book.creator = "BudgetOS";
  book.created = new Date();

  // A capa e criada agora, vazia: a ordem das abas no Excel e a ordem de
  // criacao, e os numeros dela so existem depois de montar as outras.
  const cover = book.addWorksheet("Resumo", {
    views: [{ showGridLines: false }],
  });

  const vault = get<{ name: string; investment_goal: number }>(
    "SELECT name, investment_goal FROM vault LIMIT 1"
  );

  // ---------------------------------------------------------------- Meses
  const months = all<{
    year: number;
    month: number;
    starting_balance: number;
    salary: number;
    extra_income: number;
    bank_balance: number;
    reserved_fixed_expenses: number;
    reserved_invoices: number;
    reserved_investment: number;
    available_balance: number;
    closed: number;
  }>(
    `SELECT year, month, starting_balance, salary, extra_income, bank_balance,
            reserved_fixed_expenses, reserved_invoices, reserved_investment,
            available_balance, closed
       FROM months ORDER BY year, month`
  );

  addSheet(
    book,
    "Meses",
    [
      { header: "Competência", key: "comp", width: 14 },
      { header: "Mês", key: "nome", width: 12 },
      { header: "Saldo inicial", key: "inicial", width: 15, money: true },
      { header: "Salário", key: "salario", width: 14, money: true },
      { header: "Entradas extras", key: "extra", width: 16, money: true },
      { header: "Saldo no banco", key: "banco", width: 16, money: true },
      { header: "Reservado: contas fixas", key: "rf", width: 22, money: true },
      { header: "Reservado: faturas", key: "ri", width: 19, money: true },
      { header: "Reservado: investimento", key: "rv", width: 22, money: true },
      { header: "Disponível", key: "disp", width: 15, money: true },
      { header: "Fechado", key: "fechado", width: 10 },
    ],
    months.map((m) => ({
      comp: COMPETENCE(m.year, m.month),
      nome: `${MONTH_NAMES[m.month - 1]} de ${m.year}`,
      inicial: Number(m.starting_balance),
      salario: Number(m.salary),
      extra: Number(m.extra_income),
      banco: Number(m.bank_balance),
      rf: Number(m.reserved_fixed_expenses),
      ri: Number(m.reserved_invoices),
      rv: Number(m.reserved_investment),
      disp: Number(m.available_balance),
      fechado: m.closed ? "sim" : "não",
    }))
  );

  // -------------------------------------------------------- Entradas fixas
  const incomes = all<{ name: string; amount: number; active: number }>(
    "SELECT name, amount, active FROM recurring_incomes ORDER BY sort_order, name"
  );
  addSheet(
    book,
    "Entradas fixas",
    [
      { header: "Nome", key: "nome", width: 28 },
      { header: "Valor", key: "valor", width: 14, money: true },
      { header: "Ativa", key: "ativa", width: 10 },
    ],
    incomes.map((i) => ({
      nome: i.name,
      valor: Number(i.amount),
      ativa: i.active ? "sim" : "não",
    }))
  );

  // ----------------------------------------------------------- Contas fixas
  const expenses = all<{
    name: string;
    amount: number;
    due_day: number;
    active: number;
  }>("SELECT name, amount, due_day, active FROM fixed_expenses ORDER BY due_day, name");
  addSheet(
    book,
    "Contas fixas",
    [
      { header: "Nome", key: "nome", width: 30 },
      { header: "Valor", key: "valor", width: 14, money: true },
      { header: "Dia do vencimento", key: "dia", width: 18 },
      { header: "Ativa", key: "ativa", width: 10 },
    ],
    expenses.map((e) => ({
      nome: e.name,
      valor: Number(e.amount),
      dia: e.due_day,
      ativa: e.active ? "sim" : "não",
    }))
  );

  // ------------------------------------------- Pagamentos de contas fixas
  const payments = all<{
    year: number;
    month: number;
    name: string | null;
    amount: number;
    paid_at: string;
  }>(
    `SELECT m.year, m.month, f.name, p.amount, p.paid_at
       FROM fixed_expense_payments p
       JOIN months m ON m.id = p.month_id
       LEFT JOIN fixed_expenses f ON f.id = p.fixed_expense_id
      ORDER BY m.year, m.month, p.paid_at`
  );
  addSheet(
    book,
    "Contas pagas",
    [
      { header: "Competência", key: "comp", width: 14 },
      { header: "Conta", key: "conta", width: 30 },
      { header: "Valor", key: "valor", width: 14, money: true },
      { header: "Pago em", key: "data", width: 14 },
    ],
    payments.map((p) => ({
      comp: COMPETENCE(p.year, p.month),
      conta: p.name ?? "(conta removida)",
      valor: Number(p.amount),
      data: p.paid_at.slice(0, 10),
    }))
  );

  // ------------------------------------------------------------ Assinaturas
  const subscriptions = all<{
    name: string;
    amount: number;
    billing_day: number;
    payment_method: string;
    card_name: string | null;
    start_year: number | null;
    start_month: number | null;
    active: number;
  }>(
    `SELECT s.name, s.amount, s.billing_day, s.payment_method,
            c.name AS card_name, s.start_year, s.start_month, s.active
       FROM subscriptions s
       LEFT JOIN credit_cards c ON c.id = s.card_id
      ORDER BY s.name`
  );
  addSheet(
    book,
    "Assinaturas",
    [
      { header: "Nome", key: "nome", width: 26 },
      { header: "Valor", key: "valor", width: 14, money: true },
      { header: "Dia da cobrança", key: "dia", width: 16 },
      { header: "Forma", key: "forma", width: 12 },
      { header: "Cartão", key: "cartao", width: 20 },
      { header: "Começou em", key: "inicio", width: 14 },
      { header: "Ativa", key: "ativa", width: 10 },
    ],
    subscriptions.map((s) => ({
      nome: s.name,
      valor: Number(s.amount),
      dia: s.billing_day,
      forma: s.payment_method === "credit" ? "crédito" : "débito",
      cartao: s.card_name ?? "—",
      inicio:
        s.start_year && s.start_month
          ? COMPETENCE(s.start_year, s.start_month)
          : "sempre",
      ativa: s.active ? "sim" : "não",
    }))
  );

  // ---------------------------------------------------------------- Cartões
  const cards = all<{
    name: string;
    closing_day: number;
    due_day: number;
    credit_limit: number;
    active: number;
  }>(
    "SELECT name, closing_day, due_day, credit_limit, active FROM credit_cards ORDER BY name"
  );
  addSheet(
    book,
    "Cartões",
    [
      { header: "Cartão", key: "nome", width: 24 },
      { header: "Fecha no dia", key: "fecha", width: 14 },
      { header: "Vence no dia", key: "vence", width: 14 },
      { header: "Limite", key: "limite", width: 14, money: true },
      { header: "Ativo", key: "ativo", width: 10 },
    ],
    cards.map((c) => ({
      nome: c.name,
      fecha: c.closing_day,
      vence: c.due_day,
      limite: Number(c.credit_limit),
      ativo: c.active ? "sim" : "não",
    }))
  );

  // ------------------------------------------------------ Compras parceladas
  const purchases = all<{
    description: string;
    card_name: string | null;
    category_name: string | null;
    total_amount: number;
    installments_count: number;
    first_installment_no: number;
    purchase_date: string;
    first_charge_year: number;
    first_charge_month: number;
    restantes: number;
    total_restante: number;
    ultimo_ano: number | null;
    ultimo_mes: number | null;
  }>(
    `SELECT p.description, c.name AS card_name, cat.name AS category_name,
            p.total_amount, p.installments_count, p.first_installment_no,
            p.purchase_date, p.first_charge_year, p.first_charge_month,
            COUNT(i.id) AS restantes,
            COALESCE(SUM(i.amount), 0) AS total_restante,
            MAX(i.year) AS ultimo_ano,
            (SELECT month FROM card_installments x
              WHERE x.purchase_id = p.id
              ORDER BY x.year DESC, x.month DESC LIMIT 1) AS ultimo_mes
       FROM card_purchases p
       LEFT JOIN credit_cards c ON c.id = p.card_id
       LEFT JOIN categories cat ON cat.id = p.category_id
       LEFT JOIN card_installments i ON i.purchase_id = p.id
      GROUP BY p.id
      ORDER BY c.name, p.description`
  );
  addSheet(
    book,
    "Compras parceladas",
    [
      { header: "Descrição", key: "desc", width: 34 },
      { header: "Cartão", key: "cartao", width: 20 },
      { header: "Categoria", key: "cat", width: 18 },
      { header: "Valor total", key: "total", width: 15, money: true },
      { header: "Valor da parcela", key: "parcela", width: 17, money: true },
      { header: "Parcelas", key: "qtd", width: 11 },
      { header: "Começou na parcela", key: "primeira", width: 19 },
      { header: "Data da compra", key: "data", width: 16 },
      { header: "Primeira cobrança", key: "primeiraComp", width: 18 },
      { header: "Última cobrança", key: "ultimaComp", width: 17 },
      { header: "Parcelas a pagar", key: "restantes", width: 17 },
      { header: "Total a pagar", key: "restante", width: 16, money: true },
    ],
    purchases.map((p) => ({
      desc: p.description,
      cartao: p.card_name ?? "—",
      cat: p.category_name ?? "—",
      total: Number(p.total_amount),
      parcela: round2(Number(p.total_amount) / p.installments_count),
      qtd: p.installments_count,
      primeira: p.first_installment_no,
      data: p.purchase_date.slice(0, 10),
      primeiraComp: COMPETENCE(p.first_charge_year, p.first_charge_month),
      ultimaComp:
        p.ultimo_ano && p.ultimo_mes
          ? COMPETENCE(p.ultimo_ano, p.ultimo_mes)
          : "—",
      restantes: Number(p.restantes),
      restante: Number(p.total_restante),
    }))
  );

  // --------------------------------------------------------------- Parcelas
  const installments = all<{
    description: string;
    card_name: string | null;
    installment_no: number;
    total_count: number;
    year: number;
    month: number;
    amount: number;
  }>(
    `SELECT p.description, c.name AS card_name, i.installment_no,
            p.installments_count AS total_count, i.year, i.month, i.amount
       FROM card_installments i
       JOIN card_purchases p ON p.id = i.purchase_id
       LEFT JOIN credit_cards c ON c.id = p.card_id
      ORDER BY i.year, i.month, p.description`
  );
  addSheet(
    book,
    "Parcelas",
    [
      { header: "Competência", key: "comp", width: 14 },
      { header: "Descrição", key: "desc", width: 34 },
      { header: "Cartão", key: "cartao", width: 20 },
      { header: "Parcela", key: "parcela", width: 12 },
      { header: "Valor", key: "valor", width: 14, money: true },
    ],
    installments.map((i) => ({
      comp: COMPETENCE(i.year, i.month),
      desc: i.description,
      cartao: i.card_name ?? "—",
      parcela: `${i.installment_no}/${i.total_count}`,
      valor: Number(i.amount),
    }))
  );

  // ---------------------------------------------------------------- Faturas
  const invoices = all<{
    year: number;
    month: number;
    card_name: string | null;
    installments_total: number;
    subscriptions_total: number;
    declared_total: number | null;
    total: number;
    due_date: string;
    paid: number;
    paid_at: string | null;
  }>(
    `SELECT i.year, i.month, c.name AS card_name, i.installments_total,
            i.subscriptions_total, i.declared_total, i.total, i.due_date,
            i.paid, i.paid_at
       FROM card_invoices i
       LEFT JOIN credit_cards c ON c.id = i.card_id
      ORDER BY i.year, i.month, c.name`
  );
  addSheet(
    book,
    "Faturas",
    [
      { header: "Competência", key: "comp", width: 14 },
      { header: "Cartão", key: "cartao", width: 20 },
      { header: "Parcelas", key: "parcelas", width: 14, money: true },
      { header: "Assinaturas", key: "assin", width: 15, money: true },
      { header: "Outras compras", key: "outras", width: 16, money: true },
      { header: "Total", key: "total", width: 15, money: true },
      { header: "Vencimento", key: "venc", width: 14 },
      { header: "Paga", key: "paga", width: 10 },
      { header: "Paga em", key: "pagaEm", width: 14 },
    ],
    invoices.map((i) => {
      const parcelas = Number(i.installments_total);
      const assin = Number(i.subscriptions_total);
      const total = Number(i.total);
      return {
        comp: COMPETENCE(i.year, i.month),
        cartao: i.card_name ?? "—",
        parcelas,
        assin,
        // O valor final declarado cobre compras que não foram lançadas.
        outras:
          i.declared_total === null ? 0 : round2(total - parcelas - assin),
        total,
        venc: i.due_date.slice(0, 10),
        paga: i.paid ? "sim" : "não",
        pagaEm: i.paid_at ? i.paid_at.slice(0, 10) : "—",
      };
    })
  );

  // ------------------------------------------------------------ Lançamentos
  const transactions = all<{
    year: number;
    month: number;
    date: string;
    type: string;
    description: string | null;
    category_name: string | null;
    amount: number;
    source: string;
  }>(
    `SELECT m.year, m.month, t.date, t.type, t.description,
            c.name AS category_name, t.amount, t.source
       FROM transactions t
       JOIN months m ON m.id = t.month_id
       LEFT JOIN categories c ON c.id = t.category_id
      ORDER BY t.date, t.created_at`
  );
  const TYPE_LABEL: Record<string, string> = {
    expense: "gasto",
    income: "receita",
    adjustment: "ajuste",
    investment: "aporte",
  };
  addSheet(
    book,
    "Lançamentos",
    [
      { header: "Data", key: "data", width: 12 },
      { header: "Competência", key: "comp", width: 14 },
      { header: "Tipo", key: "tipo", width: 12 },
      { header: "Descrição", key: "desc", width: 36 },
      { header: "Categoria", key: "cat", width: 18 },
      { header: "Valor", key: "valor", width: 14, money: true },
      { header: "Origem", key: "origem", width: 12 },
    ],
    transactions.map((t) => ({
      data: t.date.slice(0, 10),
      comp: COMPETENCE(t.year, t.month),
      tipo: TYPE_LABEL[t.type] ?? t.type,
      desc: t.description ?? "—",
      cat: t.category_name ?? "—",
      valor: Number(t.amount),
      origem: t.source === "ai" ? "copiloto" : t.source,
    }))
  );

  // ----------------------------------------------------------------- Ajustes
  const adjustments = all<{
    year: number;
    month: number;
    type: string;
    amount: number;
    description: string | null;
    created_at: string;
  }>(
    `SELECT m.year, m.month, a.type, a.amount, a.description, a.created_at
       FROM balance_adjustments a
       JOIN months m ON m.id = a.month_id
      ORDER BY a.created_at`
  );
  const ADJ_LABEL: Record<string, string> = {
    entry: "entrada avulsa",
    exit: "saída avulsa",
    correction: "correção de saldo",
    transfer: "transferência",
  };
  addSheet(
    book,
    "Ajustes",
    [
      { header: "Data", key: "data", width: 12 },
      { header: "Competência", key: "comp", width: 14 },
      { header: "Tipo", key: "tipo", width: 20 },
      { header: "Descrição", key: "desc", width: 36 },
      { header: "Valor", key: "valor", width: 14, money: true },
    ],
    adjustments.map((a) => ({
      data: a.created_at.slice(0, 10),
      comp: COMPETENCE(a.year, a.month),
      tipo: ADJ_LABEL[a.type] ?? a.type,
      desc: a.description ?? "—",
      valor: Number(a.amount),
    }))
  );

  // ----------------------------------------------------------------- Aportes
  const investments = all<{
    year: number;
    month: number;
    amount: number;
    description: string | null;
    created_at: string;
  }>(
    `SELECT m.year, m.month, i.amount, i.description, i.created_at
       FROM investments i
       JOIN months m ON m.id = i.month_id
      ORDER BY i.created_at`
  );
  addSheet(
    book,
    "Aportes",
    [
      { header: "Data", key: "data", width: 12 },
      { header: "Competência", key: "comp", width: 14 },
      { header: "Descrição", key: "desc", width: 36 },
      { header: "Valor", key: "valor", width: 14, money: true },
    ],
    investments.map((i) => ({
      data: i.created_at.slice(0, 10),
      comp: COMPETENCE(i.year, i.month),
      desc: i.description ?? "—",
      valor: Number(i.amount),
    }))
  );

  // -------------------------------------------------------------- Orçamentos
  const budgets = all<{
    year: number;
    month: number;
    emoji: string;
    name: string;
    planned_limit: number;
    current_limit: number;
    spent: number;
    remaining: number;
  }>(
    `SELECT m.year, m.month, c.emoji, c.name, b.planned_limit, b.current_limit,
            b.spent, b.remaining
       FROM monthly_category_budgets b
       JOIN months m ON m.id = b.month_id
       JOIN categories c ON c.id = b.category_id
      ORDER BY m.year, m.month, c.sort_order`
  );
  addSheet(
    book,
    "Orçamentos",
    [
      { header: "Competência", key: "comp", width: 14 },
      { header: "Categoria", key: "cat", width: 24 },
      { header: "Limite planejado", key: "plan", width: 17, money: true },
      { header: "Limite atual", key: "atual", width: 15, money: true },
      { header: "Gasto", key: "gasto", width: 14, money: true },
      { header: "Restante", key: "resta", width: 14, money: true },
    ],
    budgets.map((b) => ({
      comp: COMPETENCE(b.year, b.month),
      cat: `${b.emoji} ${b.name}`.trim(),
      plan: Number(b.planned_limit),
      atual: Number(b.current_limit),
      gasto: Number(b.spent),
      resta: Number(b.remaining),
    }))
  );

  // ------------------------------------------------------- Próximos meses
  // A previsão importada por planilha. Sai com as mesmas colunas do modelo,
  // então esta aba pode ser editada e reimportada em Próximos meses.
  const forecast = all<{
    year: number;
    month: number;
    kind: string;
    group_name: string;
    name: string;
    amount: number;
    status: string;
    method: string;
    notes: string;
  }>(
    `SELECT year, month, kind, group_name, name, amount, status, method, notes
       FROM forecast_entries
      ORDER BY year, month, kind DESC, amount DESC, name`
  );
  addSheet(
    book,
    "Próximos meses",
    [
      { header: "Competência", key: "comp", width: 14 },
      { header: "Tipo", key: "tipo", width: 11 },
      { header: "Grupo", key: "grupo", width: 20 },
      { header: "Descrição", key: "desc", width: 34 },
      { header: "Valor", key: "valor", width: 14, money: true },
      { header: "Status", key: "status", width: 13 },
      { header: "Forma", key: "forma", width: 16 },
      { header: "Observação", key: "obs", width: 30 },
    ],
    forecast.map((f) => ({
      comp: COMPETENCE(f.year, f.month),
      tipo: f.kind === "entrada" ? "entrada" : "saída",
      grupo: f.group_name,
      desc: f.name,
      valor: Number(f.amount),
      status: f.status,
      forma: f.method,
      obs: f.notes,
    }))
  );

  // ------------------------------------------------------------------ Capa
  cover.columns = [{ width: 32 }, { width: 22 }];
  const today = new Date();
  const coverRows: [string, string | number][] = [
    [vault?.name ?? "BudgetOS", ""],
    ["Exportado em", today.toLocaleDateString("pt-BR")],
    ["", ""],
    ["Meses registrados", months.length],
    ["Entradas fixas", incomes.length],
    ["Contas fixas", expenses.length],
    ["Assinaturas", subscriptions.length],
    ["Cartões", cards.length],
    ["Compras parceladas", purchases.length],
    ["Parcelas", installments.length],
    ["Faturas", invoices.length],
    ["Lançamentos", transactions.length],
    ["Ajustes", adjustments.length],
    ["Aportes", investments.length],
    ["Próximos meses (previsão)", forecast.length],
  ];
  coverRows.forEach(([label, value]) => cover.addRow([label, value]));
  cover.getRow(1).font = { bold: true, size: 16 };
  cover.getColumn(1).font = { bold: true };
  cover.getRow(1).getCell(1).font = { bold: true, size: 16 };

  const buffer = Buffer.from(await book.xlsx.writeBuffer());
  const stamp = today.toISOString().slice(0, 10);

  return { buffer, filename: `budgetos-${stamp}.xlsx` };
}
