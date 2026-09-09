import {
  createPayment,
  listPaymentsByMonth,
  removePayment,
  removePaymentsByMonth,
} from "@/services/actions/fixed.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const paymentRepository = {
  listByMonth: listPaymentsByMonth,
  create: createPayment,
  remove: removePayment,
  removeByMonth: removePaymentsByMonth,
};
