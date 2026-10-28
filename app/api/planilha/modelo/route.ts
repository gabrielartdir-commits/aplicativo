import { NextResponse } from "next/server";
import { buildMonthlyTemplate } from "@/lib/sheet/template";

/**
 * Baixa o modelo da planilha mensal.
 *
 * Por padrão vem com o cadastro atual preenchido — contas fixas, assinaturas,
 * parcelas, cartões, categorias e entradas fixas — para o mês ser preenchido
 * corrigindo valores. `?vazio=1` devolve o mesmo formato sem essas linhas.
 */
export async function GET(request: Request) {
  try {
    const empty = new URL(request.url).searchParams.get("vazio") === "1";
    const { buffer, filename } = await buildMonthlyTemplate(!empty);

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Erro ao gerar o modelo da planilha:", error);
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
