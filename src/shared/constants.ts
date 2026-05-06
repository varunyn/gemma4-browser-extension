import { TaskType } from "@huggingface/transformers";

import { Dtype } from "./types.ts";

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
