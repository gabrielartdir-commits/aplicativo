/**
 * Cliente de IA para provedores compatíveis com a API de chat completions da
 * OpenAI (OpenAI, Groq, OpenRouter, endpoint compatível do Gemini).
 *
 * Trocar de provedor é só questão de variáveis de ambiente:
 *   AI_BASE_URL  URL base da API (padrão: OpenAI)
 *   AI_API_KEY   Chave do provedor
 *   AI_MODEL     Nome do modelo
 *
 * Os nomes antigos (OPENAI_*) seguem funcionando como fallback.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";

interface AiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Lê a configuração do provedor. Lança se a chave não estiver definida. */
export function getAiConfig(): AiConfig {
  const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Nenhuma chave de IA configurada. Defina AI_API_KEY nas variáveis de ambiente."
    );
  }

  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );

  return {
    baseUrl,
    apiKey,
    model: process.env.AI_MODEL || process.env.OPENAI_MODEL || DEFAULT_MODEL,
  };
}

/** Schema no formato aceito por `response_format: { type: "json_schema" }`. */
export interface JsonSchemaSpec {
  name: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

interface ChatCompletionInput {
  systemPrompt: string;
  userMessage: string;
  temperature?: number;
  /** Quando presente, exige resposta em JSON obedecendo ao schema. */
  jsonSchema?: JsonSchemaSpec;
}

/**
 * Indica se o erro do provedor é recusa ao `response_format` pedido — caso em
 * que vale repetir a chamada no modo JSON genérico.
 */
function isResponseFormatUnsupported(status: number, body: string): boolean {
  if (status !== 400 && status !== 422) return false;
  const lower = body.toLowerCase();
  return (
    lower.includes("response_format") ||
    lower.includes("json_schema") ||
    lower.includes("structured output")
  );
}

async function callProvider(
  config: AiConfig,
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${config.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Envia uma conversa de um turno ao provedor e devolve o texto da resposta.
 *
 * Com `jsonSchema`, tenta primeiro Structured Outputs (`json_schema`). Se o
 * provedor não suportar, repete no modo `json_object` com o schema descrito no
 * prompt — o conteúdo continua sendo JSON, mas sem garantia do provedor, então
 * quem chama deve validar o que recebe.
 */
export async function chatCompletion({
  systemPrompt,
  userMessage,
  temperature,
  jsonSchema,
}: ChatCompletionInput): Promise<string> {
  const config = getAiConfig();

  const baseBody = {
    model: config.model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    ...(temperature !== undefined ? { temperature } : {}),
  };

  let response = await callProvider(config, {
    ...baseBody,
    ...(jsonSchema
      ? { response_format: { type: "json_schema", json_schema: jsonSchema } }
      : {}),
  });

  if (!response.ok && jsonSchema) {
    const errText = await response.text();
    if (!isResponseFormatUnsupported(response.status, errText)) {
      throw new Error(`Erro na API de IA: ${response.status} - ${errText}`);
    }

    // Fallback: modo JSON genérico, com o schema embutido no prompt.
    response = await callProvider(config, {
      ...baseBody,
      messages: [
        {
          role: "system",
          content: `${systemPrompt}\n\nResponda exclusivamente com um JSON válido que obedeça a este JSON Schema:\n${JSON.stringify(
            jsonSchema.schema
          )}`,
        },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
    });
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Erro na API de IA: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("A resposta da IA veio vazia.");
  }

  return content;
}
