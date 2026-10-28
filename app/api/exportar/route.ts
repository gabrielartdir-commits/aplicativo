import { NextResponse } from "next/server";
import { buildWorkbook } from "@/lib/export/workbook";

/** Baixa toda a base como uma planilha .xlsx, uma aba por assunto. */
export async function GET() {
  try {
    const { buffer, filename } = await buildWorkbook();

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
    console.error("Erro ao exportar a planilha:", error);
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
