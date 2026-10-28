"use server";

/**
 * Histórico de importações de planilha.
 *
 * A gravação em si mora em `lib/sheet/import.ts`, chamada pela rota de
 * importação — ela recebe um arquivo, o que uma Server Action não faz bem.
 * Aqui fica só o que a tela de Configurações precisa ler.
 */

import { all } from "@/lib/db";
import type { SheetImportLog } from "@/types/sheet";

export async function listSheetImports(): Promise<SheetImportLog[]> {
  return all<SheetImportLog>(
    `SELECT id, filename, year, month, summary, imported_at
       FROM sheet_imports ORDER BY imported_at DESC LIMIT 12`
  );
}
