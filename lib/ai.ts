/**
 * Cliente de IA do app — Claude, pela API da Anthropic.
 *
 * Variáveis de ambiente:
 *   ANTHROPIC_API_KEY    Chave criada em console.anthropic.com
 *   ANTHROPIC_MODEL      Modelo das análises (padrão: claude-opus-5-5)
 *   ANTHROPIC_MODEL_FAST Modelo de quem só interpreta frase (padrão: claude-haiku-5-5)
 *
 * Duas camadas de propósito diferente, por isso dois modelos:
 *
 *   tier "fast"  interpreta uma frase do usuário e devolve JSON. Roda a cada
 *                lançamento, inclusive por voz, então latência e custo pesam
 *                mais que profundidade.
 *   tier "deep"  analisa o orçamento inteiro. Roda sob clique, poucas vezes
 *                por mês, e é onde a qualidade do raciocínio aparece.
 *
 * A assinatura de `chatCompletion` é a mesma de quando o app falava com uma API
 * no formato da OpenAI — os três pontos de chamada seguem iguais.
 */

import Anthropic from "@anthropic-ai/sdk";

const DEFAULT_MODEL = "claude-opus-5-5";
const DEFAULT_FAST_MODEL = "claude-haiku-5-5";

/** Teto de resposta. Abaixo disso o texto corta no meio da frase. */
const MAX_TOKENS = 16000;

export type AiTier = "fast" | "deep";

/** Cliente único por processo — abrir um por requisição desperdiça conexão. */
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "Nenhuma chave de IA configurada. Defina ANTHROPIC_API_KEY em .env.local " +
        "com uma chave criada em https://console.anthropic.com/settings/keys"
    );
  }
  client ??= new Anthropic();
  return client;
}

/** Indica se a IA está configurada, sem lançar — para a interface avisar antes. */
export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function modelFor(tier: AiTier): string {
  return tier === "fast"
    ? process.env.ANTHROPIC_MODEL_FAST || DEFAULT_FAST_MODEL
    : process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

/** Schema no formato de Structured Outputs. */
export interface JsonSchemaSpec {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

interface ChatCompletionInput {
  systemPrompt: string;
  userMessage: string;
  /** Qual camada usar. Padrão: `deep`. */
  tier?: AiTier;
  /** Quando presente, a resposta é um JSON que obedece ao schema. */
  jsonSchema?: JsonSchemaSpec;
  /**
   * Profundidade do raciocínio. Padrão: `medium` no `fast`, `high` no `deep` —
   * a análise do orçamento compensa o gasto a mais, interpretar frase não.
   */
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
}

/** Erro com mensagem legível, para a rota repassar ao usuário. */
function describe(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "A chave da Anthropic foi recusada. Confira ANTHROPIC_API_KEY em .env.local.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "Limite de uso da API atingido. Tente de novo em alguns instantes.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Não foi possível falar com a API da Anthropic. Verifique a internet.";
  }
  if (error instanceof Anthropic.APIError) {
    return `Erro na API de IA (${error.status}): ${error.message}`;
  }
  return error instanceof Error ? error.message : "Erro desconhecido na IA.";
}

/**
 * Envia uma conversa de um turno ao Claude e devolve o texto da resposta.
 *
 * Com `jsonSchema`, usa Structured Outputs: a resposta é garantida pelo
 * provedor como um JSON que obedece ao schema.
 */
export async function chatCompletion({
  systemPrompt,
  userMessage,
  tier = "deep",
  jsonSchema,
  effort,
}: ChatCompletionInput): Promise<string> {
  const anthropic = getClient();

  try {
    const response = await anthropic.messages.create({
      model: modelFor(tier),
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
      output_config: {
        effort: effort ?? (tier === "fast" ? "medium" : "high"),
        ...(jsonSchema
          ? { format: { type: "json_schema" as const, schema: jsonSchema.schema } }
          : {}),
      },
    });

    if (response.stop_reason === "refusal") {
      throw new Error(
        "O modelo recusou responder a esta solicitação. Reformule o pedido."
      );
    }

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!text) throw new Error("A resposta da IA veio vazia.");
    return text;
  } catch (error) {
    throw new Error(describe(error));
  }
}
