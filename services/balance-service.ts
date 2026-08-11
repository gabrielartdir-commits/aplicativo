import { applyAdjustment } from "@/lib/finance";
import type { AdjustmentType } from "@/types/database";
import type { BalanceAdjustment, Month } from "@/types/domain";
import { adjustmentRepository } from "./repositories/adjustment-repository";
import { monthRepository } from "./repositories/month-repository";

export interface ApplyAdjustmentInput {
  month: Month;
  type: AdjustmentType;
  /** Valor positivo; para `correction` pode ser negativo (para baixo). */
  amount: number;
  description: string;
}

export const balanceService = {
  /**
   * Ajuste de saldo: altera APENAS o saldo bancário (nunca categorias)
   * e recalcula o Dinheiro Disponível.
   */
  async apply(input: ApplyAdjustmentInput): Promise<BalanceAdjustment> {
    if (input.month.closed) throw new Error("Este mês já está fechado.");

    const adjustment = await adjustmentRepository.create({
      month_id: input.month.id,
      type: input.type,
      amount: input.amount,
      description: input.description || null,
    });

    await monthRepository.update(
      input.month.id,
      applyAdjustment(input.month, input.type, input.amount)
    );

    return adjustment;
  },

  /**
   * Apaga um ajuste e desfaz o efeito dele no saldo.
   *
   * Reaplicar o ajuste com o valor invertido é mais seguro que recalcular do
   * zero: usa a mesma regra de sinal da aplicação original, então tipos como
   * `correction` (que aceita valor negativo) voltam exatamente ao que eram.
   */
  async remove(adjustment: BalanceAdjustment, month: Month): Promise<void> {
    if (month.closed) throw new Error("Este mês já está fechado.");

    await adjustmentRepository.remove(adjustment.id);
    await monthRepository.update(
      month.id,
      applyAdjustment(month, adjustment.type, -Number(adjustment.amount))
    );
  },
};
