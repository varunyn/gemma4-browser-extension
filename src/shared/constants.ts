import type { TaskType } from "@huggingface/transformers";

import { Dtype, InferenceProvider } from "./types.ts";

export const MODELS: Record<
  string,
  { modelId: string; title: string; dtype: Dtype; task: TaskType }
> = {
  allMiniLM: {
    modelId: "onnx-community/all-MiniLM-L6-v2-ONNX",
    title: "all-MiniLM-L6-v2",
    dtype: "fp32",
    task: "feature-extraction",
  },
};

export const FEATURE_EXTRACTION_ID = "allMiniLM";

export const OMLX_BASE_URL =
  import.meta.env.VITE_OMLX_BASE_URL || "http://127.0.0.1:8090/v1";
export const OMLX_MODEL_ID = import.meta.env.VITE_OMLX_MODEL_ID || "";
export const OMLX_API_KEY = import.meta.env.VITE_OMLX_API_KEY || "not-needed";
export const OLLAMA_BASE_URL =
  import.meta.env.VITE_OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
export const OLLAMA_MODEL_ID = import.meta.env.VITE_OLLAMA_MODEL_ID || "";
export const OLLAMA_API_KEY =
  import.meta.env.VITE_OLLAMA_API_KEY || "not-needed";
export const OPENAI_COMPATIBLE_BASE_URL =
  import.meta.env.VITE_OPENAI_COMPATIBLE_BASE_URL ||
  "http://127.0.0.1:3001/v1";
export const OPENAI_COMPATIBLE_MODEL_ID =
  import.meta.env.VITE_OPENAI_COMPATIBLE_MODEL_ID || "";
export const OPENAI_COMPATIBLE_API_KEY =
  import.meta.env.VITE_OPENAI_COMPATIBLE_API_KEY ||
  import.meta.env.VITE_OPENAI_API_KEY ||
  "not-needed";

const INFERENCE_BASE_URL = import.meta.env.VITE_INFERENCE_BASE_URL || "";
const INFERENCE_API_KEY = import.meta.env.VITE_INFERENCE_API_KEY || "";
const parsePositiveInteger = (
  value: string | undefined,
  fallback: number
): number => {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export const INFERENCE_MAX_TOKENS = parsePositiveInteger(
  import.meta.env.VITE_INFERENCE_MAX_TOKENS,
  512
);
export const INFERENCE_REQUEST_TIMEOUT_MS = parsePositiveInteger(
  import.meta.env.VITE_INFERENCE_REQUEST_TIMEOUT_MS,
  120000
);
export const OLLAMA_NUM_CTX = parsePositiveInteger(
  import.meta.env.VITE_OLLAMA_NUM_CTX,
  4096
);

export const INFERENCE_PROVIDER_STORAGE_KEY = "inferenceProvider";
export const INFERENCE_BASE_URL_STORAGE_KEY = "inferenceBaseUrl";
export const INFERENCE_MODEL_ID_STORAGE_KEY = "inferenceModelId";
export const INFERENCE_API_KEY_STORAGE_KEY = "inferenceApiKey";

export const INFERENCE_PROVIDER_DEFAULTS: Record<
  InferenceProvider,
  { title: string; baseUrl: string; apiKey: string }
> = {
  ollama: {
    title: "Ollama",
    baseUrl: INFERENCE_BASE_URL || OLLAMA_BASE_URL,
    apiKey: INFERENCE_API_KEY || OLLAMA_API_KEY,
  },
  omlx: {
    title: "OMLX",
    baseUrl: INFERENCE_BASE_URL || OMLX_BASE_URL,
    apiKey: INFERENCE_API_KEY || OMLX_API_KEY,
  },
  openai: {
    title: "OpenAI-compatible",
    baseUrl: INFERENCE_BASE_URL || OPENAI_COMPATIBLE_BASE_URL,
    apiKey: INFERENCE_API_KEY || OPENAI_COMPATIBLE_API_KEY,
  },
};

const envProvider = String(
  import.meta.env.VITE_INFERENCE_PROVIDER ||
    import.meta.env.VITE_LOCAL_AI_PROVIDER ||
    ""
).toLowerCase();

export const DEFAULT_INFERENCE_PROVIDER: InferenceProvider =
  envProvider === "omlx" || envProvider === "ollama" || envProvider === "openai"
    ? envProvider
    : "ollama";

export const INFERENCE_MODEL_ID =
  import.meta.env.VITE_INFERENCE_MODEL_ID || "";
