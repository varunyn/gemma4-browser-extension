import {
  INFERENCE_MAX_TOKENS,
  INFERENCE_PROVIDER_DEFAULTS,
  INFERENCE_REQUEST_TIMEOUT_MS,
  OLLAMA_NUM_CTX,
} from "../../shared/constants.ts";
import {
  getInferenceModelStorageKey,
  normalizeInferenceSettings,
} from "../../shared/inferenceSettings.ts";
import { LocalInferenceModel, LocalInferenceSettings } from "../../shared/types.ts";
import { WebMCPTool, webMCPToolToChatTemplateTool } from "./webMcp.tsx";

type LocalInferenceMessage = {
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

type LocalInferenceChatResponse = {
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

type OpenAICompatibleMessage = Omit<LocalInferenceMessage, "tool_calls"> & {
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const createLocalInferenceUrl = (baseUrl: string, path: string) =>
  `${trimTrailingSlash(baseUrl)}${path}`;

const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const serializeToolArguments = (
  value: Record<string, any> | string
): string => (typeof value === "string" ? value : JSON.stringify(value));

const serializeMessagesForOpenAI = (
  messages: LocalInferenceMessage[]
): OpenAICompatibleMessage[] =>
  messages.map(({ tool_calls, ...message }) => {
    if (!tool_calls) {
      return message;
    }

    return {
      ...message,
      tool_calls: tool_calls.map((toolCall) => ({
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: serializeToolArguments(toolCall.function.arguments),
        },
      })),
    };
  });

const createTimeoutSignal = (timeoutMs: number): AbortSignal => {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
};

const getStoredInferenceSettings = async (): Promise<LocalInferenceSettings> =>
  new Promise((resolve) => {
    const defaultSettings = normalizeInferenceSettings();
    const modelStorageKey = getInferenceModelStorageKey(
      defaultSettings.provider
    );

    chrome.storage.local.get([modelStorageKey], (result) => {
      resolve(
        normalizeInferenceSettings({
          modelId: result[modelStorageKey] as string,
        })
      );
    });
  });

const scoreDiscoveredModel = (model: LocalInferenceModel): number => {
  const id = model.id.toLowerCase();
  let score = 0;

  if (id.includes("gemma")) score += 100;
  if (id.includes("4bit") || id.includes("q4")) score += 20;
  if (id.includes("it") || id.includes("instruct")) score += 10;
  if (id.includes("tts")) score -= 50;
  if (id.includes("markitdown")) score -= 50;
  if (id.includes("assistant-bf16")) score -= 20;

  return score;
};

export const listLocalInferenceModels = async (
  settings?: LocalInferenceSettings
): Promise<LocalInferenceModel[]> => {
  const activeSettings = normalizeInferenceSettings(
    settings ?? (await getStoredInferenceSettings())
  );
  const response = await fetch(
    createLocalInferenceUrl(activeSettings.baseUrl, "/models"),
    {
      headers: {
        Authorization: `Bearer ${activeSettings.apiKey}`,
      },
    }
  );

  if (!response.ok) {
    throw new Error(
      `${INFERENCE_PROVIDER_DEFAULTS[activeSettings.provider].title} model discovery failed (${response.status} ${response.statusText})`
    );
  }

  const payload = (await response.json()) as { data?: LocalInferenceModel[] };
  return payload.data ?? [];
};

export const getLocalInferenceModelId = async (): Promise<string> => {
  const settings = await getStoredInferenceSettings();

  if (settings.modelId.trim()) {
    return settings.modelId.trim();
  }

  const models = await listLocalInferenceModels(settings);
  const modelId =
    [...models].sort(
      (a, b) => scoreDiscoveredModel(b) - scoreDiscoveredModel(a)
    )[0]?.id ?? models[0]?.id;

  if (!modelId) {
    throw new Error(
      `${INFERENCE_PROVIDER_DEFAULTS[settings.provider].title} did not return any models. Load a model, or select one in the extension.`
    );
  }

  return modelId;
};

export const checkLocalInferenceConnection = async () => {
  await getLocalInferenceModelId();
};

export const generateWithLocalInference = async ({
  messages,
  tools,
}: {
  messages: LocalInferenceMessage[];
  tools: WebMCPTool[];
}): Promise<{
  text: string;
  promptTokens: number;
  generatedTokens: number;
}> => {
  const settings = await getStoredInferenceSettings();
  const model = settings.modelId.trim() || (await getLocalInferenceModelId());
  const body: Record<string, any> = {
    model,
    messages: serializeMessagesForOpenAI(messages),
    tools: tools.map(webMCPToolToChatTemplateTool),
    tool_choice: tools.length > 0 ? "auto" : undefined,
    temperature: 0,
    max_tokens: INFERENCE_MAX_TOKENS,
    stream: false,
  };

  if (settings.provider === "ollama") {
    body.options = {
      num_ctx: OLLAMA_NUM_CTX,
    };
  }

  const response = await fetch(
    createLocalInferenceUrl(settings.baseUrl, "/chat/completions"),
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: createTimeoutSignal(INFERENCE_REQUEST_TIMEOUT_MS),
    }
  ).catch((error) => {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(
        `${INFERENCE_PROVIDER_DEFAULTS[settings.provider].title} generation timed out after ${Math.round(INFERENCE_REQUEST_TIMEOUT_MS / 1000)}s. Try a smaller model, lower VITE_INFERENCE_MAX_TOKENS, lower VITE_OLLAMA_NUM_CTX, or disable page/browser tools for simple chats.`
      );
    }

    throw error;
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `${INFERENCE_PROVIDER_DEFAULTS[settings.provider].title} generation failed for model "${model}" (${response.status} ${response.statusText}): ${detail}`
    );
  }

  const payload = (await response.json()) as LocalInferenceChatResponse;
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
