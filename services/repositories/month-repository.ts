import {
  createMonth,
  findLatestMonth,
  findLatestMonthBefore,
  findLatestOpenMonth,
  findMonthById,
  findMonthByYearMonth,
  listMonths,
  updateMonth,
} from "@/services/actions/core.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const monthRepository = {
  findByYearMonth: findMonthByYearMonth,
  findById: findMonthById,
  findLatestOpen: findLatestOpenMonth,
  findLatest: findLatestMonth,
  findLatestBefore: findLatestMonthBefore,
  list: listMonths,
  create: createMonth,
  update: updateMonth,
};
