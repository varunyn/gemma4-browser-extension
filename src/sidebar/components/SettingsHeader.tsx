import cn from "../utils/classnames.ts";
import InferenceSettings from "./InferenceSettings.tsx";

interface SettingsHeaderProps {
  className?: string;
}

export default function SettingsHeader({
  className = "",
}: SettingsHeaderProps) {
  return (
    <header
      className={cn(
        className,
        "border-b border-chrome-border bg-chrome-bg-primary px-6 py-4"
      )}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-normal text-chrome-text-primary leading-tight">
            Local Browser Assistant
          </h1>
          <p className="text-sm text-chrome-text-secondary mt-1">
            Ollama or OMLX
          </p>
        </div>
        <InferenceSettings />
      </div>
    </header>
  );
}
