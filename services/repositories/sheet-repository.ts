import { listSheetImports } from "@/services/actions/sheet.actions";

/** Fachada sobre a Server Action, no padrão dos outros repositórios. */
export const sheetRepository = {
  imports: listSheetImports,
};
