import { OMLX_API_KEY, OMLX_BASE_URL, OMLX_MODEL_ID } from "../../shared/constants.ts";
import { WebMCPTool, webMCPToolToChatTemplateTool } from "./webMcp.tsx";

type OmlxMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: Record<string, any> | string;
    };
  }>;
};

type OmlxModel = {
  id: string;
};

type OmlxChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
      tool_calls?: Array<{
        id?: string;
        type?: "function";
        function?: {
          name?: string;
          arguments?: Record<string, any> | string;
        };
      }>;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const createOmlxUrl = (path: string) =>
  `${trimTrailingSlash(OMLX_BASE_URL)}${path}`;

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const scoreDiscoveredModel = (model: OmlxModel): number => {
  const id = model.id.toLowerCase();
  let score = 0;

  if (id.includes("gemma")) score += 100;
  if (id.includes("4bit")) score += 20;
  if (id.includes("it")) score += 10;
  if (id.includes("tts")) score -= 50;
  if (id.includes("markitdown")) score -= 50;
  if (id.includes("assistant-bf16")) score -= 20;

  return score;
};

export const getOmlxModelId = async (): Promise<string> => {
  if (OMLX_MODEL_ID.trim()) {
    return OMLX_MODEL_ID.trim();
  }

  const response = await fetch(createOmlxUrl("/models"), {
    headers: {
      Authorization: `Bearer ${OMLX_API_KEY}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `OMLX model discovery failed (${response.status} ${response.statusText})`
    );
  }

  const payload = (await response.json()) as { data?: OmlxModel[] };
  const models = payload.data ?? [];
  const modelId =
    [...models].sort(
      (a, b) => scoreDiscoveredModel(b) - scoreDiscoveredModel(a)
    )[0]?.id ?? models[0]?.id;

  if (!modelId) {
    throw new Error(
      "OMLX did not return any models. Set VITE_OMLX_MODEL_ID or load a model in OMLX."
    );
  }

  return modelId;
};

export const checkOmlxConnection = async () => {
  await getOmlxModelId();
};

export const generateWithOmlx = async ({
  messages,
  tools,
}: {
  messages: OmlxMessage[];
  tools: WebMCPTool[];
}): Promise<{
  text: string;
  promptTokens: number;
  generatedTokens: number;
}> => {
  const model = await getOmlxModelId();
  const response = await fetch(createOmlxUrl("/chat/completions"), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OMLX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.map(webMCPToolToChatTemplateTool),
      tool_choice: tools.length > 0 ? "auto" : undefined,
      temperature: 0,
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OMLX generation failed for model "${model}" (${response.status} ${response.statusText}): ${detail}`
    );
  }

  const payload = (await response.json()) as OmlxChatResponse;
  const message = payload.choices?.[0]?.message;
  const content = message?.content ?? "";
  const toolCalls = message?.tool_calls ?? [];
  const renderedToolCalls = toolCalls
    .map((toolCall) => {
      const functionName = toolCall.function?.name;
      const functionArguments = toolCall.function?.arguments ?? {};

      if (typeof functionName !== "string" || !functionName.trim()) {
        return "";
      }

      const serializedArguments =
        typeof functionArguments === "string"
          ? functionArguments
          : JSON.stringify(functionArguments);

      return `<|tool_call>call:${functionName}${serializedArguments}<tool_call|>`;
    })
    .filter(Boolean)
    .join("");

  const text = renderedToolCalls || content;
  const promptTokens =
    payload.usage?.prompt_tokens ??
    estimateTokens(messages.map((message) => message.content).join("\n"));
  const generatedTokens =
    payload.usage?.completion_tokens ?? estimateTokens(text);

  return {
    text,
    promptTokens,
    generatedTokens,
  };
};
