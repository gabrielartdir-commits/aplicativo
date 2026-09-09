import {
  findInvoiceByCardAndCompetence,
  listAllInvoices,
  listInvoicesByCompetence,
  openInvoiceTotalByCompetence,
  updateInvoice,
  upsertInvoice,
} from "@/services/actions/cards.actions";

/** Fachada sobre as Server Actions (ver vault-repository). */
export const cardInvoiceRepository = {
  listByCompetence: listInvoicesByCompetence,
  listAll: listAllInvoices,
  findByCardAndCompetence: findInvoiceByCardAndCompetence,
  upsert: upsertInvoice,
  update: updateInvoice,
  openTotalByCompetence: openInvoiceTotalByCompetence,
};
