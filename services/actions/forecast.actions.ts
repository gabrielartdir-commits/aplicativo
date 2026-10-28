"use server";

/**
 * Projeção dos próximos meses.
 *
 * Só leitura, e nada exclusivo: a projeção é calculada a partir do cadastro
 * que as outras telas já usam (contas fixas, assinaturas, parcelas) e da
 * média dos gastos já lançados. Não há tabela de previsão para manter.
 */

import { buildProjection } from "@/lib/forecast/project";
import type { ForecastProjection } from "@/types/forecast";

export async function getForecastProjection(): Promise<ForecastProjection> {
  return buildProjection();
}
