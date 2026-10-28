import { NextResponse } from "next/server";
import { readWorkbook } from "@/lib/sheet/read";
import { importSheet } from "@/lib/sheet/import";

/** 15 MB cobre com folga uma planilha de um mês. */
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Recebe a planilha mensal.
 *
 * `modo=conferir` (padrão) só lê e informa o que mudaria; `modo=aplicar`
 * grava. Havendo linha com erro, aplicar é recusado com 422 e o relatório
 * explica o que corrigir — a não ser que venha `ignorarErros=1`, que grava
 * só as linhas boas.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("arquivo");
    const mode = String(form.get("modo") ?? "conferir");
    const ignoreIssues = String(form.get("ignorarErros") ?? "") === "1";

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "Nenhum arquivo foi enviado." },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json({ error: "O arquivo está vazio." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "O arquivo passa de 15 MB. Uma planilha de um mês não chega perto disso — confira se é o arquivo certo." },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    if (name.endsWith(".xls")) {
      return NextResponse.json(
        { error: "Formato .xls (Excel antigo) não é lido. Abra no Excel e use Salvar como → Pasta de Trabalho do Excel (.xlsx)." },
        { status: 400 }
      );
    }
    if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) {
      return NextResponse.json(
        { error: "Envie a planilha em .xlsx. Baixe o modelo ao lado se precisar." },
        { status: 400 }
      );
    }

    const payload = await readWorkbook(await file.arrayBuffer());
    const report = await importSheet(payload, {
      filename: file.name,
      apply: mode === "aplicar",
      ignoreIssues,
    });

    // Pedido de aplicar que não aplicou: o relatório é a resposta útil, mas o
    // status precisa dizer que não gravou.
    const blocked = mode === "aplicar" && !report.applied;
    return NextResponse.json(report, { status: blocked ? 422 : 200 });
  } catch (error) {
    console.error("Erro ao importar a planilha:", error);
    const msg =
      error instanceof Error ? error.message : "Não consegui ler a planilha.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
