import { NextResponse } from "next/server";
import { parseForecastWorkbook } from "@/lib/forecast/parse";
import { applyForecastImport } from "@/lib/forecast/apply";

/** Teto do arquivo. Uma planilha de previsão não chega perto disso. */
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Recebe a planilha dos próximos meses.
 *
 * Dois modos, no campo `modo`:
 *
 *   * `conferir` (padrão) — lê o arquivo e devolve o que aconteceria: quantas
 *     linhas, quais competências, quantas linhas antigas seriam substituídas
 *     e os problemas encontrados. Não grava nada.
 *   * `aplicar` — grava. Com alguma linha com problema, não grava e devolve o
 *     relatório com os erros (422), a não ser que venha `ignorarErros=1`,
 *     que grava só as linhas válidas.
 *
 * A gravação é por competência e dentro de uma transação: os meses do arquivo
 * são substituídos, os outros ficam intactos, e ou entra tudo ou nada.
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
        { error: "O arquivo passa de 15 MB. Confira se é mesmo a planilha." },
        { status: 400 }
      );
    }

    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm")) {
      return NextResponse.json(
        {
          error: name.endsWith(".xls")
            ? 'O formato .xls é antigo demais para ser lido. No Excel, use "Salvar como" e escolha .xlsx.'
            : "Envie a planilha em .xlsx (Excel, Google Planilhas ou LibreOffice exportam nesse formato).",
        },
        { status: 400 }
      );
    }

    const parsed = await parseForecastWorkbook(await file.arrayBuffer());

    const report = applyForecastImport(parsed, {
      filename: file.name,
      apply: mode === "aplicar",
      ignoreIssues,
    });

    // Pedido para gravar que não gravou: foram os erros das linhas.
    const blocked = mode === "aplicar" && !report.applied;
    return NextResponse.json(report, { status: blocked ? 422 : 200 });
  } catch (error) {
    console.error("Erro ao importar a planilha de próximos meses:", error);
    const msg =
      error instanceof Error
        ? error.message
        : "Não consegui ler o arquivo. Confira se é a planilha em .xlsx.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
