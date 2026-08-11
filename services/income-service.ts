import { applyIncome, round2 } from "@/lib/finance";
import type { Month, RecurringIncome } from "@/types/domain";
import { monthRepository } from "./repositories/month-repository";
import { recurringIncomeRepository } from "./repositories/recurring-income-repository";

/**
 * Aplica ao mês corrente a variação de uma entrada fixa.
 *
 * Entrada que sobe entra no banco e no disponível na hora; entrada que desce
 * sai dos dois. `months.salary` acompanha, para a soma continuar batendo com
 * as entradas ativas.
 */
async function applyDelta(month: Month | null, delta: number): Promise<void> {
  if (!month || month.closed || Math.abs(delta) < 0.005) return;

  await monthRepository.update(month.id, {
    salary: round2(Number(month.salary) + delta),
    ...applyIncome(month, delta),
  });
}

/** Quanto uma entrada contribui hoje: zero quando inativa. */
function contribution(income: RecurringIncome): number {
  return income.active ? Number(income.amount) : 0;
}

export const incomeService = {
  async create(
    input: { name: string; amount: number; sort_order?: number },
    month: Month | null
  ): Promise<RecurringIncome> {
    const created = await recurringIncomeRepository.create(input);
    await applyDelta(month, contribution(created));
    return created;
  },

  async update(
    id: string,
    patch: { name?: string; amount?: number; active?: boolean },
    month: Month | null
  ): Promise<RecurringIncome> {
    const before = await recurringIncomeRepository.findById(id);
    if (!before) throw new Error("Entrada não encontrada.");

    const updated = await recurringIncomeRepository.update(id, patch);
    await applyDelta(month, contribution(updated) - contribution(before));
    return updated;
  },

  async remove(id: string, month: Month | null): Promise<void> {
    const before = await recurringIncomeRepository.findById(id);
    await recurringIncomeRepository.remove(id);
    if (before) await applyDelta(month, -contribution(before));
  },
};
