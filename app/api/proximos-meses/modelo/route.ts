import { NextResponse } from "next/server";
import { buildTemplate } from "@/lib/forecast/template";

/**
 * Baixa o modelo de planilha dos próximos meses.
 *
 * `?preencher=1` devolve o mesmo modelo já com o que o app conhece dos
 * próximos 12 meses — contas fixas, assinaturas, parcelas e entradas fixas —
 * para conferir e completar em vez de digitar tudo.
 */
export async function GET(request: Request) {
  try {
    const prefill = new URL(request.url).searchParams.get("preencher") === "1";
    const { buffer, filename } = await buildTemplate(prefill);

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
    console.error("Erro ao gerar o modelo de próximos meses:", error);
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
