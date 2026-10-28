import { NextResponse } from "next/server";
import { chatCompletion, isAiConfigured } from "@/lib/ai";
import { getFinancialSnapshot } from "@/services/actions/analysis.actions";

/**
 * Consultoria sobre o ano inteiro, não só o mês.
 *
 * O retrato é montado no servidor (`getFinancialSnapshot`) e o cliente não
 * manda nada — assim a análise não depende do que a tela conseguiu carregar, e
 * ninguém consegue pedir análise de dados inventados.
 */

const SYSTEM_PROMPT = `Você analisa as finanças pessoais de um brasileiro a partir dos dados do app dele.

Escreva em português do Brasil, falando direto com a pessoa, em segunda pessoa.

Produza EXATAMENTE estas quatro seções, em Markdown, nesta ordem:

## Onde você está
O diagnóstico em 3 a 5 itens: quanto entra, quanto está comprometido antes de
qualquer escolha, qual a sobra real por mês e quanto do que entra fica. Calcule
a taxa de poupança (aportes ÷ entradas) e diga o número.

## Para onde o dinheiro vai
2 a 4 itens sobre o que mais consome a renda. Compare os meses do fluxo anual e
aponte o que mudou. Separe o que é fixo do que é escolha mês a mês.

## O custo do crédito
2 a 4 itens sobre parcelas e faturas: quanto sai por mês em parcelas, quando
cada compromisso termina e quanto de folga isso libera em qual mês. Se houver
parcela terminando logo, diga o mês e o valor que volta para o bolso.

## O que fazer agora
3 a 5 ações concretas e ordenadas, cada uma com o número que a justifica. Dê
prioridade ao que mais aumenta a sobra mensal.

REGRAS:
- Use os valores reais dos dados. Nenhum conselho genérico, nenhum número inventado.
- Se um dado estiver ausente ou zerado, diga que falta registrar — não deduza.
- Se algo estiver saudável, diga. Não invente problema.
- Reais no formato R$ 1.234,56. Meses como "março de 2027".
- Sem preâmbulo e sem despedida. Comece pelo primeiro título.
- Máximo de 600 palavras.

LIMITE IMPORTANTE: você NÃO é consultor de investimentos licenciado. Nunca
recomende onde investir, nem produto, ativo, corretora, banco, cripto ou
percentual de carteira. Nunca projete rendimento futuro. Se a pessoa precisar
dessa decisão, diga em uma linha que isso é conversa para um profissional
certificado. O que você faz é organização do orçamento: achar dinheiro que
escapa, ordenar dívidas pela mais caras, aumentar a sobra e sustentar o aporte.`;

export async function POST() {
  try {
    if (!isAiConfigured()) {
      return NextResponse.json(
        {
          error:
            "Nenhuma chave de IA configurada. Defina ANTHROPIC_API_KEY em .env.local.",
        },
        { status: 503 }
      );
    }

    const snapshot = await getFinancialSnapshot();

    if (!snapshot.mes_atual) {
      return NextResponse.json(
        { error: "Nenhum mês aberto — abra um mês para haver o que analisar." },
        { status: 400 }
      );
    }

    const reply = await chatCompletion({
      systemPrompt: SYSTEM_PROMPT,
      userMessage: `Analise estes dados e produza as quatro seções:\n\n${JSON.stringify(
        snapshot,
        null,
        2
      )}`,
      tier: "deep",
    });

    return NextResponse.json({ reply, geradoEm: snapshot.gerado_em });
  } catch (error) {
    console.error("Erro na rota de consultoria:", error);
    const msg = error instanceof Error ? error.message : "Erro interno.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
