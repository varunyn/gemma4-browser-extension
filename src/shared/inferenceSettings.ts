import {
  DEFAULT_INFERENCE_PROVIDER,
  INFERENCE_MODEL_ID,
  INFERENCE_MODEL_ID_STORAGE_KEY,
  INFERENCE_PROVIDER_DEFAULTS,
  OLLAMA_MODEL_ID,
  OMLX_MODEL_ID,
  OPENAI_COMPATIBLE_MODEL_ID,
} from "./constants.ts";
import { InferenceProvider, LocalInferenceSettings } from "./types.ts";

export const isInferenceProvider = (
  value: unknown
): value is InferenceProvider =>
  value === "ollama" || value === "omlx" || value === "openai";

const getProviderDefaultModelId = (provider: InferenceProvider): string => {
  if (INFERENCE_MODEL_ID.trim()) {
    return INFERENCE_MODEL_ID.trim();
  }

  if (provider === "ollama") {
    return OLLAMA_MODEL_ID.trim();
  }

  if (provider === "omlx") {
    return OMLX_MODEL_ID.trim();
  }

  if (provider === "openai") {
    return OPENAI_COMPATIBLE_MODEL_ID.trim();
  }

  return "";
};

export const getInferenceModelStorageKey = (provider: InferenceProvider) =>
  `${INFERENCE_MODEL_ID_STORAGE_KEY}:${provider}`;

export const getDefaultInferenceSettings = (
  provider: InferenceProvider = DEFAULT_INFERENCE_PROVIDER
): LocalInferenceSettings => ({
  provider,
  baseUrl: INFERENCE_PROVIDER_DEFAULTS[provider].baseUrl,
  modelId: getProviderDefaultModelId(provider),
  apiKey: INFERENCE_PROVIDER_DEFAULTS[provider].apiKey,
});

export const normalizeInferenceSettings = (
  input: Partial<LocalInferenceSettings> = {}
): LocalInferenceSettings => {
  const provider = isInferenceProvider(input.provider)
    ? input.provider
    : DEFAULT_INFERENCE_PROVIDER;
  const defaults = getDefaultInferenceSettings(provider);

  return {
    provider,
    baseUrl: input.baseUrl?.trim() || defaults.baseUrl,
    modelId: input.modelId?.trim() || defaults.modelId,
    apiKey: input.apiKey?.trim() || defaults.apiKey,
  };
};
