import "server-only";

/**
 * Gravação da planilha mensal nas tabelas de verdade.
 *
 * Duas fases, de propósito:
 *
 *   1. UMA transação síncrona escreve todas as linhas — cadastro, mês,
 *      parcelas, lançamentos, aportes, ajustes, pagamentos e o rastro da
 *      importação. Ou entra o arquivo inteiro, ou não entra nada. É isso que
 *      impede uma planilha pela metade de deixar o mês incoerente.
 *   2. Depois do commit, `cardService.refresh` refaz as faturas da competência
 *      e `monthService.recalculate` reconstrói saldo, reservas e disponível a
 *      partir do que ficou gravado.
 *
 * A fase 2 fica fora da transação porque `transaction()` é síncrona e esses
 * serviços são assíncronos — uma `Promise` dentro dela comitaria antes de a
 * escrita terminar. Não é um risco: as duas operações derivam tudo do estado
 * do banco, então repetir não muda o resultado, e o botão "Recalcular saldos"
 * das Configurações faz exatamente a mesma coisa se algo as interromper.
 *
 * O que torna a reimportação segura é o rastro em `sheet_import_rows`: só as
 * linhas de MOVIMENTO que uma importação anterior da mesma competência criou
 * são apagadas. Cadastro é casado por nome e nunca apagado, e o que o Gabriel
 * lançou à mão dentro do app não é tocado em nenhuma hipótese.
 */

import { all, get, newId, run, transaction } from "@/lib/db";
import {
  computeMonthOpening,
  installmentCompetences,
  round2,
  splitInstallments,
} from "@/lib/finance";
import { competenceForPurchase, monthLabel } from "@/lib/dates";
import { cardService } from "@/services/card-service";
import { monthService } from "@/services/month-service";
import type { Month } from "@/types/domain";
import type { SheetImportReport, SheetIssue } from "@/types/sheet";
import type { SheetReadResult } from "./read";
import { normalize } from "./values";

export interface ImportOptions {
  filename: string;
  /** `false` só confere e informa o que mudaria. */
  apply: boolean;
  /** Grava as linhas boas mesmo havendo linhas com erro. */
  ignoreIssues: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

function emptyCounts(): SheetImportReport["counts"] {
  return {
    categoriasCriadas: 0,
    categoriasAtualizadas: 0,
    cartoesCriados: 0,
    cartoesAtualizados: 0,
    entradasCriadas: 0,
    entradasAtualizadas: 0,
    fixosCriados: 0,
    fixosAtualizados: 0,
    fixosPagos: 0,
    assinaturasCriadas: 0,
    assinaturasAtualizadas: 0,
    comprasCriadas: 0,
    comprasAtualizadas: 0,
    lancamentos: 0,
    aportes: 0,
    ajustes: 0,
  };
}

/** Índice nome normalizado → id, para casar cadastro por nome. */
function indexByName(
  rows: { id: string; name: string }[]
): Map<string, string> {
  const map = new Map<string, string>();
  for (const row of rows) {
    const key = normalize(row.name);
    if (!map.has(key)) map.set(key, row.id);
  }
  return map;
}

/** Linhas de movimento que importações anteriores desta competência criaram. */
function previousRows(year: number, month: number) {
  const imports = all<{ id: string }>(
    "SELECT id FROM sheet_imports WHERE year = :year AND month = :month",
    { year, month }
  );
  if (imports.length === 0) {
    return { importIds: [], rows: [] as { entity: string; row_id: string }[] };
  }
  const list = imports.map((row) => `'${row.id}'`).join(",");
  return {
    importIds: imports.map((row) => row.id),
    rows: all<{ entity: string; row_id: string }>(
      `SELECT entity, row_id FROM sheet_import_rows WHERE import_id IN (${list})`
    ),
  };
}

const TABLE_OF: Record<string, string> = {
  transaction: "transactions",
  investment: "investments",
  adjustment: "balance_adjustments",
  payment: "fixed_expense_payments",
};

export async function importSheet(
  payload: SheetReadResult,
  options: ImportOptions
): Promise<SheetImportReport> {
  const { monthRow } = payload;
  if (!monthRow) {
    throw new Error("A planilha não disse de qual mês ela é.");
  }

  const year = monthRow.year;
  const month = monthRow.month;
  const competence = `${pad(month)}/${year}`;
  const counts = emptyCounts();
  const warnings: string[] = [];
  const issues: SheetIssue[] = [...payload.issues];

  const totals = {
    saidas: round2(
      payload.transactions
        .filter((t) => t.kind === "expense")
        .reduce((sum, t) => sum + t.amount, 0)
    ),
    entradas: round2(
      payload.transactions
        .filter((t) => t.kind === "income")
        .reduce((sum, t) => sum + t.amount, 0)
    ),
  };

  // ------------------------------------------------------------- cadastro
  const existingCategories = all<{ id: string; name: string }>(
    "SELECT id, name FROM categories"
  );
  const existingCards = all<{ id: string; name: string }>(
    "SELECT id, name FROM credit_cards"
  );
  const existingIncomes = all<{ id: string; name: string }>(
    "SELECT id, name FROM recurring_incomes"
  );
  const existingFixed = all<{ id: string; name: string }>(
    "SELECT id, name FROM fixed_expenses"
  );
  const existingSubscriptions = all<{ id: string; name: string }>(
    "SELECT id, name FROM subscriptions"
  );
  const existingPurchases = all<{
    id: string;
    description: string;
    card_name: string;
  }>(
    `SELECT p.id, p.description, c.name AS card_name
       FROM card_purchases p JOIN credit_cards c ON c.id = p.card_id`
  );

  const categoryIds = indexByName(existingCategories);
  const cardIds = indexByName(existingCards);
  const incomeIds = indexByName(existingIncomes);
  const fixedIds = indexByName(existingFixed);
  const subscriptionIds = indexByName(existingSubscriptions);
  const purchaseIds = new Map(
    existingPurchases.map((row) => [
      `${normalize(row.description)}|${normalize(row.card_name)}`,
      row.id,
    ])
  );

  /*
   * Categorias citadas em qualquer aba entram na conta.
   *
   * Uma categoria escrita só na aba Lançamentos é criada com limite zero: o
   * lançamento não pode ficar sem categoria por causa de uma linha que falta
   * na aba Categorias.
   */
  const categoryNames = new Map<string, string>();
  const noteCategory = (name: string) => {
    const key = normalize(name);
    if (key !== "" && !categoryNames.has(key)) categoryNames.set(key, name);
  };
  for (const row of payload.categories) noteCategory(row.name);
  for (const row of payload.transactions) {
    if (row.kind === "expense") noteCategory(row.categoryName);
  }
  for (const row of payload.subscriptions) noteCategory(row.categoryName);
  for (const row of payload.purchases) noteCategory(row.categoryName);

  for (const [key] of categoryNames) {
    if (categoryIds.has(key)) counts.categoriasAtualizadas++;
    else counts.categoriasCriadas++;
  }
  for (const row of payload.cards) {
    if (cardIds.has(normalize(row.name))) counts.cartoesAtualizados++;
    else counts.cartoesCriados++;
  }
  for (const row of payload.incomes) {
    if (incomeIds.has(normalize(row.name))) counts.entradasAtualizadas++;
    else counts.entradasCriadas++;
  }
  for (const row of payload.fixed) {
    if (fixedIds.has(normalize(row.name))) counts.fixosAtualizados++;
    else counts.fixosCriados++;
    if (row.paid) counts.fixosPagos++;
  }
  for (const row of payload.subscriptions) {
    if (subscriptionIds.has(normalize(row.name))) {
      counts.assinaturasAtualizadas++;
    } else {
      counts.assinaturasCriadas++;
    }
  }
  for (const row of payload.purchases) {
    const key = `${normalize(row.description)}|${normalize(row.cardName)}`;
    if (purchaseIds.has(key)) counts.comprasAtualizadas++;
    else counts.comprasCriadas++;
  }

  counts.lancamentos = payload.transactions.length;
  counts.aportes = payload.investments.length;
  counts.ajustes = payload.adjustments.length;

  /*
   * Assinatura e compra no crédito precisam de um cartão que exista — ou que
   * a própria planilha esteja criando. Sem isso o banco recusaria a linha no
   * meio da transação, e a mensagem do SQLite não ajudaria ninguém.
   */
  const cardWillExist = (name: string): boolean => {
    const key = normalize(name);
    return (
      cardIds.has(key) || payload.cards.some((c) => normalize(c.name) === key)
    );
  };
  for (const row of payload.subscriptions) {
    if (row.method === "credit" && !cardWillExist(row.cardName)) {
      issues.push({
        sheet: "Assinaturas",
        row: 0,
        message: `a assinatura "${row.name}" é no crédito e aponta para o cartão "${row.cardName}", que não existe no app nem na aba Cartões. Acrescente o cartão lá, ou troque a forma para débito.`,
      });
    }
  }
  for (const row of payload.purchases) {
    if (!cardWillExist(row.cardName)) {
      issues.push({
        sheet: "Compras parceladas",
        row: 0,
        message: `a compra "${row.description}" aponta para o cartão "${row.cardName}", que não existe no app nem na aba Cartões.`,
      });
    }
  }

  const existingMonth = get<Month>(
    "SELECT * FROM months WHERE year = :year AND month = :month",
    { year, month }
  );
  const monthCreated = !existingMonth;
  if (existingMonth?.closed) {
    warnings.push(
      `${monthLabel({ year, month })} está fechado no app. A importação grava de todo jeito — é o normal ao subir a planilha de um mês que já acabou.`
    );
  }

  const previous = previousRows(year, month);
  const replaced = {
    lancamentos: previous.rows.filter((r) => r.entity === "transaction").length,
    aportes: previous.rows.filter((r) => r.entity === "investment").length,
    ajustes: previous.rows.filter((r) => r.entity === "adjustment").length,
    pagamentos: previous.rows.filter((r) => r.entity === "payment").length,
  };

  if (payload.missingSheets.length > 0) {
    warnings.push(
      `A planilha não trouxe ${payload.missingSheets.length === 1 ? "a aba" : "as abas"} ${payload.missingSheets.join(", ")} — o que está no app nessas áreas fica como está.`
    );
  }

  const report: SheetImportReport = {
    filename: options.filename,
    competence,
    monthLabel: monthLabel({ year, month }),
    applied: false,
    monthCreated,
    issues,
    warnings,
    counts,
    replaced,
    totals,
    balances: null,
  };

  const blocked = issues.length > 0 && !options.ignoreIssues;
  if (!options.apply || blocked) return report;

  // ------------------------------------------------------------- gravação
  transaction(() => {
    // 1. Categorias
    let sortOrder =
      Number(
        get<{ next: number }>(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM categories"
        )?.next ?? 1
      ) || 1;

    for (const [key, name] of categoryNames) {
      const sheetRow = payload.categories.find(
        (row) => normalize(row.name) === key
      );
      const id = categoryIds.get(key);
      if (id) {
        if (sheetRow) {
          run(
            `UPDATE categories SET name = :name,
                emoji = COALESCE(NULLIF(:emoji, ''), emoji),
                default_limit = COALESCE(:limit, default_limit)
              WHERE id = :id`,
            {
              id,
              name: sheetRow.name,
              emoji: sheetRow.emoji,
              limit: sheetRow.limit,
            }
          );
        }
        continue;
      }
      const created = newId();
      run(
        `INSERT INTO categories (id, emoji, name, default_limit, sort_order)
         VALUES (:id, :emoji, :name, :limit, :sort_order)`,
        {
          id: created,
          emoji: sheetRow?.emoji ?? "",
          name: sheetRow?.name ?? name,
          limit: sheetRow?.limit ?? 0,
          sort_order: sortOrder++,
        }
      );
      categoryIds.set(key, created);
    }

    // 2. Cartões
    for (const row of payload.cards) {
      const key = normalize(row.name);
      const id = cardIds.get(key);
      if (id) {
        run(
          `UPDATE credit_cards SET name = :name, closing_day = :closing,
              due_day = :due, credit_limit = COALESCE(:limit, credit_limit)
            WHERE id = :id`,
          {
            id,
            name: row.name,
            closing: row.closingDay,
            due: row.dueDay,
            limit: row.creditLimit,
          }
        );
        continue;
      }
      const created = newId();
      run(
        `INSERT INTO credit_cards (id, name, closing_day, due_day, credit_limit)
         VALUES (:id, :name, :closing, :due, :limit)`,
        {
          id: created,
          name: row.name,
          closing: row.closingDay,
          due: row.dueDay,
          limit: row.creditLimit ?? 0,
        }
      );
      cardIds.set(key, created);
    }

    // 3. Entradas fixas
    let incomeOrder =
      Number(
        get<{ next: number }>(
          "SELECT COALESCE(MAX(sort_order), 0) + 1 AS next FROM recurring_incomes"
        )?.next ?? 1
      ) || 1;

    for (const row of payload.incomes) {
      const key = normalize(row.name);
      const id = incomeIds.get(key);
      if (id) {
        run(
          "UPDATE recurring_incomes SET name = :name, amount = :amount, active = :active WHERE id = :id",
          { id, name: row.name, amount: row.amount, active: row.active }
        );
        continue;
      }
      const created = newId();
      run(
        `INSERT INTO recurring_incomes (id, name, amount, active, sort_order)
         VALUES (:id, :name, :amount, :active, :sort_order)`,
        {
          id: created,
          name: row.name,
          amount: row.amount,
          active: row.active,
          sort_order: incomeOrder++,
        }
      );
      incomeIds.set(key, created);
    }

    // 4. Gastos fixos
    for (const row of payload.fixed) {
      const key = normalize(row.name);
      const id = fixedIds.get(key);
      if (id) {
        run(
          `UPDATE fixed_expenses SET name = :name, amount = :amount,
              due_day = CASE WHEN :due > 0 THEN :due ELSE due_day END,
              active = :active
            WHERE id = :id`,
          {
            id,
            name: row.name,
            amount: row.amount,
            due: row.dueDay,
            active: row.active,
          }
        );
        continue;
      }
      const created = newId();
      run(
        `INSERT INTO fixed_expenses (id, name, amount, due_day, active)
         VALUES (:id, :name, :amount, :due, :active)`,
        {
          id: created,
          name: row.name,
          amount: row.amount,
          due: row.dueDay > 0 ? row.dueDay : 1,
          active: row.active,
        }
      );
      fixedIds.set(key, created);
    }

    // 5. Assinaturas
    for (const row of payload.subscriptions) {
      const key = normalize(row.name);
      const cardId =
        row.method === "credit" ? (cardIds.get(normalize(row.cardName)) ?? null) : null;
      const categoryId = row.categoryName
        ? (categoryIds.get(normalize(row.categoryName)) ?? null)
        : null;
      const id = subscriptionIds.get(key);

      if (id) {
        run(
          `UPDATE subscriptions SET name = :name, amount = :amount,
              billing_day = CASE WHEN :day > 0 THEN :day ELSE billing_day END,
              payment_method = :method, card_id = :card_id,
              category_id = COALESCE(:category_id, category_id),
              active = :active
            WHERE id = :id`,
          {
            id,
            name: row.name,
            amount: row.amount,
            day: row.billingDay,
            method: row.method,
            card_id: cardId,
            category_id: categoryId,
            active: row.active,
          }
        );
        continue;
      }
      const created = newId();
      run(
        `INSERT INTO subscriptions
           (id, name, amount, billing_day, payment_method, card_id, category_id,
            start_year, start_month, active)
         VALUES (:id, :name, :amount, :day, :method, :card_id, :category_id,
                 :year, :month, :active)`,
        {
          id: created,
          name: row.name,
          amount: row.amount,
          day: row.billingDay > 0 ? row.billingDay : 1,
          method: row.method,
          card_id: cardId,
          category_id: categoryId,
          year,
          month,
          active: row.active,
        }
      );
      subscriptionIds.set(key, created);
    }

    // 6. O mês
    let monthId = existingMonth?.id ?? "";
    if (!existingMonth) {
      const fixedTotal = round2(
        Number(
          get<{ total: number }>(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM fixed_expenses WHERE active = 1"
          )?.total ?? 0
        )
      );
      const incomeTotal = round2(
        Number(
          get<{ total: number }>(
            "SELECT COALESCE(SUM(amount), 0) AS total FROM recurring_incomes WHERE active = 1"
          )?.total ?? 0
        )
      );
      const goal = Number(
        get<{ investment_goal: number }>(
          "SELECT investment_goal FROM vault LIMIT 1"
        )?.investment_goal ?? 0
      );
      // Saldo inicial em branco: o saldo final do mês anterior, como na
      // abertura de mês pelo app.
      const beforeBalance = Number(
        get<{ bank_balance: number }>(
          `SELECT bank_balance FROM months
            WHERE (year < :year) OR (year = :year AND month < :month)
            ORDER BY year DESC, month DESC LIMIT 1`,
          { year, month }
        )?.bank_balance ?? 0
      );

      const startingBalance = monthRow.startingBalance ?? beforeBalance;
      const salary = monthRow.salary ?? incomeTotal;
      const extraIncome = monthRow.extraIncome ?? 0;
      const balances = computeMonthOpening({
        startingBalance,
        salary,
        extraIncome,
        fixedExpensesTotal: fixedTotal,
        investmentGoal: goal,
      });

      monthId = newId();
      run(
        `INSERT INTO months
           (id, year, month, starting_balance, salary, extra_income,
            bank_balance, reserved_fixed_expenses, reserved_investment,
            reserved_invoices, available_balance, closed)
         VALUES
           (:id, :year, :month, :starting_balance, :salary, :extra_income,
            :bank_balance, :reserved_fixed_expenses, :reserved_investment,
            :reserved_invoices, :available_balance, 0)`,
        {
          id: monthId,
          year,
          month,
          starting_balance: startingBalance,
          salary,
          extra_income: extraIncome,
          ...balances,
        }
      );
    } else {
      const patch: Record<string, number> = {};
      if (monthRow.startingBalance !== null) {
        patch.starting_balance = monthRow.startingBalance;
      }
      if (monthRow.salary !== null) patch.salary = monthRow.salary;
      if (monthRow.extraIncome !== null) {
        patch.extra_income = monthRow.extraIncome;
      }
      const keys = Object.keys(patch);
      if (keys.length > 0) {
        run(
          `UPDATE months SET ${keys.map((k) => `${k} = :${k}`).join(", ")} WHERE id = :id`,
          { ...patch, id: monthId }
        );
      }
    }

    /*
     * Orçamento do mês para toda categoria — inclusive as que acabaram de
     * nascer nesta importação. Sem isso o gasto de uma categoria nova não
     * teria onde somar e a tela de categorias mostraria o mês incompleto.
     */
    const missingBudgets = all<{ id: string; default_limit: number }>(
      `SELECT c.id, c.default_limit FROM categories c
        WHERE NOT EXISTS (
          SELECT 1 FROM monthly_category_budgets b
           WHERE b.month_id = :month_id AND b.category_id = c.id
        )`,
      { month_id: monthId }
    );
    for (const category of missingBudgets) {
      run(
        `INSERT INTO monthly_category_budgets
           (id, month_id, category_id, planned_limit, current_limit, spent)
         VALUES (:id, :month_id, :category_id, :limit, :limit, 0)`,
        {
          id: newId(),
          month_id: monthId,
          category_id: category.id,
          limit: Number(category.default_limit),
        }
      );
    }

    // 7. Compras parceladas
    for (const row of payload.purchases) {
      const cardId = cardIds.get(normalize(row.cardName));
      if (!cardId) continue;
      const categoryId = row.categoryName
        ? (categoryIds.get(normalize(row.categoryName)) ?? null)
        : null;

      const closingDay = Number(
        get<{ closing_day: number }>(
          "SELECT closing_day FROM credit_cards WHERE id = :id",
          { id: cardId }
        )?.closing_day ?? 1
      );

      /*
       * A parcela informada é a que cai NESTE mês, então a competência da
       * primeira parcela materializada é a da planilha. Só uma compra nova
       * (parcela 1) tem a competência derivada da data e do fechamento.
       */
      const firstCharge =
        row.currentInstallment > 1
          ? { year, month }
          : competenceForPurchase(row.purchaseDate, closingDay);

      const key = `${normalize(row.description)}|${normalize(row.cardName)}`;
      const existingId = purchaseIds.get(key);
      const purchaseId = existingId ?? newId();

      if (existingId) {
        run(
          `UPDATE card_purchases SET card_id = :card_id, category_id = :category_id,
              description = :description, total_amount = :total,
              installments_count = :count, first_installment_no = :first,
              purchase_date = :date, first_charge_year = :charge_year,
              first_charge_month = :charge_month
            WHERE id = :id`,
          {
            id: purchaseId,
            card_id: cardId,
            category_id: categoryId,
            description: row.description,
            total: row.totalAmount,
            count: row.installmentsCount,
            first: row.currentInstallment,
            date: row.purchaseDate,
            charge_year: firstCharge.year,
            charge_month: firstCharge.month,
          }
        );
        /*
         * Refazer é mais seguro que remendar, como no card-service — mas só
         * daqui para frente.
         *
         * Apagar todas as parcelas da compra levaria as que já venceram em
         * meses anteriores, e com elas a base das faturas antigas. Então saem
         * apenas as parcelas que esta importação vai recriar: as da
         * competência da planilha em diante, mais qualquer uma cujo número
         * seja igual ou maior que a parcela atual (uma planilha que corrige a
         * parcela para trás reescreveria um número que já existe, e o UNIQUE
         * da tabela derrubaria a importação inteira).
         */
        run(
          `DELETE FROM card_installments
            WHERE purchase_id = :id
              AND (installment_no >= :first
                   OR year > :year
                   OR (year = :year AND month >= :month))`,
          { id: purchaseId, first: row.currentInstallment, year, month }
        );
      } else {
        run(
          `INSERT INTO card_purchases
             (id, card_id, category_id, description, total_amount,
              installments_count, first_installment_no, purchase_date,
              first_charge_year, first_charge_month)
           VALUES
             (:id, :card_id, :category_id, :description, :total,
              :count, :first, :date, :charge_year, :charge_month)`,
          {
            id: purchaseId,
            card_id: cardId,
            category_id: categoryId,
            description: row.description,
            total: row.totalAmount,
            count: row.installmentsCount,
            first: row.currentInstallment,
            date: row.purchaseDate,
            charge_year: firstCharge.year,
            charge_month: firstCharge.month,
          }
        );
        purchaseIds.set(key, purchaseId);
      }

      // Valor da parcela vem do total ORIGINAL dividido por TODAS as parcelas.
      const amounts = splitInstallments(
        row.totalAmount,
        row.installmentsCount
      ).slice(row.currentInstallment - 1);
      const competences = installmentCompetences(
        firstCharge.year,
        firstCharge.month,
        amounts.length
      );
      competences.forEach((item, index) => {
        run(
          `INSERT INTO card_installments
             (id, purchase_id, installment_no, year, month, amount)
           VALUES (:id, :purchase_id, :no, :year, :month, :amount)`,
          {
            id: newId(),
            purchase_id: purchaseId,
            no: row.currentInstallment + index,
            year: item.year,
            month: item.month,
            amount: amounts[index],
          }
        );
      });
    }

    // 8. Fora o cadastro: o movimento da importação anterior deste mês sai.
    for (const row of previous.rows) {
      const table = TABLE_OF[row.entity];
      if (table) {
        run(`DELETE FROM ${table} WHERE id = :id`, { id: row.row_id });
      }
    }
    for (const id of previous.importIds) {
      run("DELETE FROM sheet_imports WHERE id = :id", { id });
    }

    // 9. O rastro desta importação
    const importId = newId();
    run(
      `INSERT INTO sheet_imports (id, filename, year, month, summary)
       VALUES (:id, :filename, :year, :month, :summary)`,
      {
        id: importId,
        filename: options.filename,
        year,
        month,
        summary: `${payload.transactions.length} lançamentos, ${payload.fixed.length} contas fixas, ${payload.subscriptions.length} assinaturas`,
      }
    );
    const trace = (entity: string, rowId: string) =>
      run(
        `INSERT INTO sheet_import_rows (id, import_id, entity, row_id)
         VALUES (:id, :import_id, :entity, :row_id)`,
        { id: newId(), import_id: importId, entity, row_id: rowId }
      );

    // 10. Lançamentos
    for (const row of payload.transactions) {
      const id = newId();
      const categoryId =
        row.kind === "expense" && row.categoryName
          ? (categoryIds.get(normalize(row.categoryName)) ?? null)
          : null;
      run(
        `INSERT INTO transactions
           (id, month_id, category_id, type, amount, description, source, date)
         VALUES (:id, :month_id, :category_id, :type, :amount, :description,
                 'manual', :date)`,
        {
          id,
          month_id: monthId,
          category_id: categoryId,
          type: row.kind,
          amount: row.amount,
          description: row.description,
          date: row.date,
        }
      );
      trace("transaction", id);
    }

    // 11. Aportes
    for (const row of payload.investments) {
      const id = newId();
      run(
        `INSERT INTO investments (id, month_id, amount, description)
         VALUES (:id, :month_id, :amount, :description)`,
        {
          id,
          month_id: monthId,
          amount: row.amount,
          description: row.description || "Aporte",
        }
      );
      trace("investment", id);
    }

    // 12. Ajustes de saldo
    for (const row of payload.adjustments) {
      const id = newId();
      run(
        `INSERT INTO balance_adjustments (id, month_id, type, amount, description)
         VALUES (:id, :month_id, :type, :amount, :description)`,
        {
          id,
          month_id: monthId,
          type: row.type,
          amount: row.amount,
          description: row.description || null,
        }
      );
      trace("adjustment", id);
    }

    /*
     * 13. Contas fixas marcadas como pagas.
     *
     * Pagamento que já existe e não veio de importação é do app — não é
     * duplicado nem apagado, só contado. A planilha dizer "não" numa conta
     * que o app sabe estar paga não desfaz o pagamento: a planilha pode ter
     * sido gerada antes, e desfazer silenciosamente seria pior que ignorar.
     */
    let keptPayments = 0;
    for (const row of payload.fixed) {
      if (!row.paid) continue;
      const expenseId = fixedIds.get(normalize(row.name));
      if (!expenseId) continue;

      const already = get<{ id: string }>(
        `SELECT id FROM fixed_expense_payments
          WHERE month_id = :month_id AND fixed_expense_id = :expense_id`,
        { month_id: monthId, expense_id: expenseId }
      );
      if (already) {
        keptPayments++;
        continue;
      }
      const id = newId();
      run(
        `INSERT INTO fixed_expense_payments
           (id, month_id, fixed_expense_id, amount)
         VALUES (:id, :month_id, :expense_id, :amount)`,
        {
          id,
          month_id: monthId,
          expense_id: expenseId,
          amount: row.amount,
        }
      );
      trace("payment", id);
    }
    if (keptPayments > 0) {
      warnings.push(
        `${keptPayments} ${keptPayments === 1 ? "conta fixa já estava" : "contas fixas já estavam"} baixada${keptPayments === 1 ? "" : "s"} como paga${keptPayments === 1 ? "" : "s"} no app neste mês — a importação manteve o pagamento que já existia.`
      );
    }

    /*
     * 14. Gasto por categoria, somado de novo a partir das transações.
     *
     * Nada incremental: o `spent` é derivado, e refazê-lo do zero é o que faz
     * reimportar não acumular o gasto duas vezes.
     */
    run(
      `UPDATE monthly_category_budgets
          SET spent = COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                 WHERE t.month_id = :month_id
                   AND t.type = 'expense'
                   AND t.category_id = monthly_category_budgets.category_id
              ), 0)
        WHERE month_id = :month_id`,
      { month_id: monthId }
    );

    report.monthCreated = monthCreated;
  });

  /*
   * Fase 2, fora da transação: faturas e saldos derivados do que ficou
   * gravado. `refresh` refaz as faturas da competência a partir das parcelas
   * e das assinaturas no crédito; `recalculate` reconstrói saldo, reservas e
   * disponível somando tudo de novo.
   */
  const saved = get<Month>(
    "SELECT * FROM months WHERE year = :year AND month = :month",
    { year, month }
  );
  if (saved) {
    const refreshed = await cardService.refresh(saved);
    const recalculated = await monthService.recalculate(refreshed);
    report.balances = {
      bank: Number(recalculated.bank_balance),
      available: Number(recalculated.available_balance),
    };
  }

  report.applied = true;
  return report;
}
