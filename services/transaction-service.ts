import {
  applyExpense,
  applyIncome,
  applyInvestment,
  round2,
  computeAvailable,
} from "@/lib/finance";
import { toISODate } from "@/lib/dates";
import type { TransactionSource } from "@/types/database";
import type { Month, Transaction } from "@/types/domain";
import { budgetRepository } from "./repositories/budget-repository";
import { monthRepository } from "./repositories/month-repository";
import { transactionRepository } from "./repositories/transaction-repository";
import { investmentRepository } from "./repositories/investment-repository";
import { vaultRepository } from "./repositories/vault-repository";

export interface RegisterExpenseInput {
  month: Month;
  amount: number;
  categoryId: string | null;
  description: string;
  date?: string;
  source?: TransactionSource;
}

export interface RegisterIncomeInput {
  month: Month;
  amount: number;
  description: string;
  date?: string;
  source?: TransactionSource;
}

export const transactionService = {
  /**
   * Registra um gasto: cria a transação, soma no `spent` da categoria
   * do mês e recalcula saldo bancário + disponível.
   */
  async registerExpense(input: RegisterExpenseInput): Promise<Transaction> {
    if (input.month.closed) throw new Error("Este mês já está fechado.");

    const transaction = await transactionRepository.create({
      month_id: input.month.id,
      category_id: input.categoryId,
      type: "expense",
      amount: input.amount,
      description: input.description || null,
      source: input.source ?? "manual",
      date: input.date ?? toISODate(),
    });

    if (input.categoryId) {
      const budget = await budgetRepository.findByMonthAndCategory(
        input.month.id,
        input.categoryId
      );
      if (budget) {
        await budgetRepository.updateSpent(
          budget.id,
          round2(budget.spent + input.amount)
        );
      }
    }

    await monthRepository.update(
      input.month.id,
      applyExpense(input.month, input.amount)
    );

    return transaction;
  },

  /** Registra uma receita: entra no banco e aumenta o disponível. */
  async registerIncome(input: RegisterIncomeInput): Promise<Transaction> {
    if (input.month.closed) throw new Error("Este mês já está fechado.");

    const transaction = await transactionRepository.create({
      month_id: input.month.id,
      category_id: null,
      type: "income",
      amount: input.amount,
      description: input.description || null,
      source: input.source ?? "manual",
      date: input.date ?? toISODate(),
    });

    await monthRepository.update(
      input.month.id,
      applyIncome(input.month, input.amount)
    );

    return transaction;
  },

  /** Registra um aporte de investimento: entra nas transações e debita da reserva, mantendo saldo bancário. */
  async registerInvestment(input: {
    month: Month;
    amount: number;
    description: string;
    date?: string;
    source?: TransactionSource;
  }): Promise<Transaction> {
    if (input.month.closed) throw new Error("Este mês já está fechado.");

    const transaction = await transactionRepository.create({
      month_id: input.month.id,
      category_id: null,
      type: "investment",
      amount: input.amount,
      description: input.description || "Aporte de Investimento",
      source: input.source ?? "manual",
      date: input.date ?? toISODate(),
    });

    // Registrar no repositório de investimentos para fins de meta visual
    await investmentRepository.create({
      month_id: input.month.id,
      amount: input.amount,
      description: input.description || "Aporte de Investimento",
    });

    const vault = await vaultRepository.find();
    const goal = vault?.investment_goal ?? 0;

    const allInvestments = await investmentRepository.listByMonth(input.month.id);
    const totalInvested = allInvestments.reduce((sum, i) => sum + i.amount, 0);

    const newReserved = Math.max(goal, totalInvested);
    await monthRepository.update(input.month.id, {
      reserved_investment: newReserved,
      available_balance: computeAvailable(
        input.month.bank_balance,
        input.month.reserved_fixed_expenses,
        newReserved,
        input.month.reserved_invoices
      ),
    });

    return transaction;
  },

  /** Deleta uma transação e reverte seu impacto no orçamento e saldos do mês. */
  async deleteTransaction(id: string): Promise<void> {
    const tx = await transactionRepository.findById(id);
    if (!tx) throw new Error("Transação não encontrada.");

    const month = await monthRepository.findById(tx.month_id);
    if (!month) throw new Error("Mês correspondente não encontrado.");
    if (month.closed) throw new Error("O mês desta transação já está fechado.");

    // 1. Desfazer impacto no orçamento da categoria, se houver
    if (tx.category_id && tx.type === "expense") {
      const budget = await budgetRepository.findByMonthAndCategory(
        tx.month_id,
        tx.category_id
      );
      if (budget) {
        await budgetRepository.updateSpent(
          budget.id,
          round2(Math.max(0, budget.spent - tx.amount))
        );
      }
    }

    // 2. Desfazer impacto nos saldos do mês
    if (tx.type === "expense") {
      await monthRepository.update(
        month.id,
        applyIncome(month, tx.amount)
      );
    } else if (tx.type === "income") {
      await monthRepository.update(
        month.id,
        applyExpense(month, tx.amount)
      );
    } else if (tx.type === "investment") {
      await investmentRepository.removeByMonthAndAmountAndDescription(
        month.id,
        tx.amount,
        tx.description ?? ""
      );

      const vault = await vaultRepository.find();
      const goal = vault?.investment_goal ?? 0;

      const allInvestments = await investmentRepository.listByMonth(month.id);
      const totalInvested = allInvestments.reduce((sum, i) => sum + i.amount, 0);

      const newReserved = Math.max(goal, totalInvested);
      await monthRepository.update(month.id, {
        reserved_investment: newReserved,
        available_balance: computeAvailable(
          month.bank_balance,
          month.reserved_fixed_expenses,
          newReserved,
          month.reserved_invoices
        ),
      });
    }

    // 3. Deletar a transação
    await transactionRepository.remove(id);
  },

  /** Atualiza os dados de uma transação e ajusta proporcionalmente o saldo e orçamento do mês. */
  async updateTransaction(
    id: string,
    input: {
      amount: number;
      categoryId: string | null;
      description: string;
      date: string;
    }
  ): Promise<Transaction> {
    const tx = await transactionRepository.findById(id);
    if (!tx) throw new Error("Transação não encontrada.");

    const month = await monthRepository.findById(tx.month_id);
    if (!month) throw new Error("Mês correspondente não encontrado.");
    if (month.closed) throw new Error("O mês desta transação já está fechado.");

    // 1. Reverter o impacto da transação antiga
    let currentMonthState = { ...month };

    if (tx.category_id && tx.type === "expense") {
      const oldBudget = await budgetRepository.findByMonthAndCategory(
        tx.month_id,
        tx.category_id
      );
      if (oldBudget) {
        await budgetRepository.updateSpent(
          oldBudget.id,
          round2(Math.max(0, oldBudget.spent - tx.amount))
        );
      }
    }

    if (tx.type === "expense") {
      currentMonthState = await monthRepository.update(
        month.id,
        applyIncome(currentMonthState, tx.amount)
      );
    } else if (tx.type === "income") {
      currentMonthState = await monthRepository.update(
        month.id,
        applyExpense(currentMonthState, tx.amount)
      );
    } else if (tx.type === "investment") {
      await investmentRepository.removeByMonthAndAmountAndDescription(
        month.id,
        tx.amount,
        tx.description ?? ""
      );

      const vault = await vaultRepository.find();
      const goal = vault?.investment_goal ?? 0;

      const allInvestments = await investmentRepository.listByMonth(month.id);
      const totalInvested = allInvestments.reduce((sum, i) => sum + i.amount, 0);

      const newReserved = Math.max(goal, totalInvested);
      currentMonthState = await monthRepository.update(month.id, {
        reserved_investment: newReserved,
        available_balance: computeAvailable(
          currentMonthState.bank_balance,
          currentMonthState.reserved_fixed_expenses,
          newReserved,
          currentMonthState.reserved_invoices
        ),
      });
    }

    // 2. Aplicar o impacto da nova transação
    if (input.categoryId && tx.type === "expense") {
      const newBudget = await budgetRepository.findByMonthAndCategory(
        tx.month_id,
        input.categoryId
      );
      if (newBudget) {
        await budgetRepository.updateSpent(
          newBudget.id,
          round2(newBudget.spent + input.amount)
        );
      }
    }

    if (tx.type === "expense") {
      currentMonthState = await monthRepository.update(
        month.id,
        applyExpense(currentMonthState, input.amount)
      );
    } else if (tx.type === "income") {
      currentMonthState = await monthRepository.update(
        month.id,
        applyIncome(currentMonthState, input.amount)
      );
    } else if (tx.type === "investment") {
      await investmentRepository.create({
        month_id: month.id,
        amount: input.amount,
        description: input.description,
      });

      const vault = await vaultRepository.find();
      const goal = vault?.investment_goal ?? 0;

      const allInvestments = await investmentRepository.listByMonth(month.id);
      const totalInvested = allInvestments.reduce((sum, i) => sum + i.amount, 0);

      const newReserved = Math.max(goal, totalInvested);
      currentMonthState = await monthRepository.update(month.id, {
        reserved_investment: newReserved,
        available_balance: computeAvailable(
          currentMonthState.bank_balance,
          currentMonthState.reserved_fixed_expenses,
          newReserved,
          currentMonthState.reserved_invoices
        ),
      });
    }

    // 3. Salvar as alterações da transação
    return transactionRepository.update(id, {
      amount: input.amount,
      category_id: input.categoryId,
      description: input.description,
      date: input.date,
    });
  },
};

