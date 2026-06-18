import { RefreshCw } from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import {
  INFERENCE_PROVIDER_DEFAULTS,
} from "../../shared/constants.ts";
import {
  getDefaultInferenceSettings,
  getInferenceModelStorageKey,
  normalizeInferenceSettings,
} from "../../shared/inferenceSettings.ts";
import {
  BackgroundTasks,
  LocalInferenceModel,
  LocalInferenceSettings,
  ResponseStatus,
} from "../../shared/types.ts";
import { Button, InputSelect } from "../theme";

type LoadStatus = "idle" | "loading" | "ready" | "error";

const saveSelectedModel = (modelId: string) => {
  const storageKey = getInferenceModelStorageKey(
    getDefaultInferenceSettings().provider
  );

  chrome.storage.local.set({
    [storageKey]: modelId,
  });
};

export default function InferenceSettings() {
  const [settings, setSettings] = useState<LocalInferenceSettings>(
    getDefaultInferenceSettings()
  );
  const [models, setModels] = useState<LocalInferenceModel[]>([]);
  const [status, setStatus] = useState<LoadStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const modelOptions = useMemo(() => {
    const options = models.map((model) => ({
      value: model.id,
      label: model.id,
    }));

    if (
      settings.modelId &&
      !options.some((option) => option.value === settings.modelId)
    ) {
      options.unshift({ value: settings.modelId, label: settings.modelId });
    }

    return [{ value: "", label: "Auto" }, ...options];
  }, [models, settings.modelId]);

  const loadModels = (nextSettings: LocalInferenceSettings) => {
    setStatus("loading");
    setError(null);

    chrome.runtime.sendMessage(
      {
        type: BackgroundTasks.LIST_CHAT_MODELS,
        settings: nextSettings,
      },
      (
        response:
          | {
              status: ResponseStatus.SUCCESS;
              models: LocalInferenceModel[];
            }
          | {
              status: ResponseStatus.ERROR;
              error: string;
            }
      ) => {
        if (response.status === ResponseStatus.SUCCESS) {
          setModels(response.models);
          setStatus("ready");
          return;
        }

        setModels([]);
        setError(response.error);
        setStatus("error");
      }
    );
  };

  useEffect(() => {
    const defaultSettings = getDefaultInferenceSettings();
    const modelStorageKey = getInferenceModelStorageKey(
      defaultSettings.provider
    );

    chrome.storage.local.get([modelStorageKey], (result) => {
      const storedSettings = normalizeInferenceSettings({
        modelId: result[modelStorageKey] as string,
      });

      setSettings(storedSettings);
      loadModels(storedSettings);
    });
  }, []);

  const handleModelChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const modelId = event.target.value;
    setSettings({ ...settings, modelId });
    saveSelectedModel(modelId);
  };

  return (
    <div className="flex flex-col gap-2 md:items-end">
      <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto md:items-end">
        <div className="flex min-w-24 flex-col gap-2">
          <span className="text-sm font-medium text-chrome-text-primary">
            Provider
          </span>
          <span className="rounded border border-chrome-border bg-chrome-bg-primary px-4 py-2.5 text-sm text-chrome-text-secondary">
            {INFERENCE_PROVIDER_DEFAULTS[settings.provider].title}
          </span>
        </div>
        <InputSelect
          id="inference-model"
          label="Model"
          value={settings.modelId}
          onChange={handleModelChange}
          options={modelOptions}
          disabled={status === "loading"}
          className="min-w-56"
        />
        <Button
          type="button"
          color="secondary"
          variant="solid"
          iconLeft={<RefreshCw />}
          loading={status === "loading"}
          onClick={() => loadModels(settings)}
          className="self-start sm:self-end"
        />
      </div>
      {error && (
        <p className="max-w-80 text-right text-xs text-red-400">{error}</p>
      )}
    </div>
  );
}
