import { NextRequest, NextResponse } from "next/server";
import { chatCompletion } from "@/lib/ai";

const SYSTEM_PROMPT = `Você é um consultor financeiro pessoal analisando o orçamento de um usuário brasileiro.

Sua tarefa é produzir uma análise curta e acionável, em português do Brasil, com DUAS seções:

## Pontos de atenção no mês atual
2 a 4 itens sobre o que merece cuidado AGORA. Cite números concretos dos dados.

## Como se programar nos próximos meses
2 a 4 itens sobre o que vem pela frente — parcelas terminando ou começando,
meses mais apertados, oportunidades de folga.

Regras:
- Seja específico e use os valores reais. Nada de conselho genérico.
- Se algo estiver saudável, diga — não invente problema.
- Fale direto com a pessoa, em segunda pessoa.
- Use Markdown com listas. Sem preâmbulo, comece pela primeira seção.
- Máximo de 250 palavras no total.
- Você NÃO é consultor de investimentos: não recomende produtos financeiros
  nem onde investir. Fale apenas de organização do próprio orçamento.`;

export async function POST(req: NextRequest) {
  try {
    const { context } = await req.json();
    if (!context || typeof context !== "object") {
      return NextResponse.json(
        { error: "Contexto do mês é obrigatório." },
        { status: 400 }
      );
    }

    const reply = await chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Analise este orçamento e produza as duas seções:\n\n${JSON.stringify(
        context,
        null,
        2
      )}`,
      temperature: 0.3,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Erro na rota de insights:", error);
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
