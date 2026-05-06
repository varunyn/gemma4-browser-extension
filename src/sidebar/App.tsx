import { useEffect, useState } from "react";

import { BackgroundTasks, ResponseStatus } from "../shared/types.ts";
import Chat from "./chat/Chat.tsx";
import SettingsHeader from "./components/SettingsHeader.tsx";
import { Loader, Message } from "./theme";

enum AppStatus {
  IDLE,
  CHECKING,
  READY,
  ERROR,
}

export default function App() {
  const [status, setStatus] = useState<AppStatus>(AppStatus.IDLE);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStatus(AppStatus.CHECKING);
    chrome.runtime.sendMessage(
      { type: BackgroundTasks.CHECK_MODELS },
      (
        e:
          | {
              results: Array<{
                size: number;
                cached: boolean;
                modelId: string;
              }>;
              status: ResponseStatus.SUCCESS;
            }
          | {
              error: string;
              status: ResponseStatus.ERROR;
            }
      ) => {
        if (e.status === ResponseStatus.SUCCESS) {
          setStatus(AppStatus.READY);
        }
        if (e.status === ResponseStatus.ERROR) {
          setError(e.error);
          setStatus(AppStatus.ERROR);
        }
      }
    );
  }, []);

  if (status === AppStatus.ERROR) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-8 px-6">
        <Message type="error" title="Setup error">
          {error}
        </Message>
      </div>
    );
  }

  if (status === AppStatus.IDLE || status === AppStatus.CHECKING) {
    return (
      <div className="flex items-center justify-center h-full w-full flex-col gap-8 px-6">
        <Loader />
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      <SettingsHeader />
      <main className="flex-1 overflow-y-auto bg-chrome-bg-primary">
        <Chat />
      </main>
    </div>
  );
}
