import {
  createAdjustment,
  listAdjustmentsByMonth,
  removeAdjustment,
} from "@/services/actions/ledger.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const adjustmentRepository = {
  listByMonth: listAdjustmentsByMonth,
  create: createAdjustment,
  remove: removeAdjustment,
};
