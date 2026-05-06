import { ChevronLeft, ChevronRight, Wrench } from "lucide-react";
import { useState } from "react";

import { ChatMessageTool } from "../../shared/types.ts";
import { Loader } from "../theme";
import cn from "../utils/classnames.ts";

export default function MessageToolCall({
  tools,
  className = "",
}: {
  tools: Array<ChatMessageTool>;
  className?: string;
}) {
  const [currentToolIndex, setCurrentToolIndex] = useState(0);
  const [expanded, setExpanded] = useState<boolean>(false);

  const goToPrevious = () => {
    setCurrentToolIndex((prev) => (prev > 0 ? prev - 1 : tools.length - 1));
  };

  const goToNext = () => {
    setCurrentToolIndex((prev) => (prev < tools.length - 1 ? prev + 1 : 0));
  };

  const activeTool = tools[currentToolIndex];
  const isLoading = activeTool.result === "";

  return (
    <div
      className={cn(
        className,
        "border border-chrome-border rounded bg-chrome-bg-tertiary p-3"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <button
          className="flex items-center gap-2 text-xs cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          {isLoading ? <Loader size="xs" /> : <Wrench className="h-3 w-3" />}
          {isLoading ? "calling tool" : "called tool"} <b>{activeTool.name}</b>
        </button>
        {tools.length > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={goToPrevious}
              disabled={currentToolIndex === 0}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer",
                "hover:bg-chrome-hover text-chrome-text-primary"
              )}
              aria-label="Previous tool"
            >
              <ChevronLeft className="h-3 w-3" />
            </button>
            <div className="text-xs text-chrome-text-secondary">
              {currentToolIndex + 1} / {tools.length}
            </div>
            <button
              onClick={goToNext}
              disabled={currentToolIndex === tools.length - 1}
              className={cn(
                "p-1 rounded transition-colors cursor-pointer",
                "hover:bg-chrome-hover text-chrome-text-primary"
              )}
              aria-label="Next tool"
            >
              <ChevronRight className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <div className="space-y-2 mt-2">
          <div>
            <div className="text-xs text-chrome-text-secondary mb-1">
              Function:
            </div>
            <code className="text-xs bg-chrome-bg-primary px-2 py-1 rounded block text-chrome-accent-primary font-mono overflow-hidden">
              {tools[currentToolIndex].functionSignature}
            </code>
          </div>
          <div>
            <div className="text-xs text-chrome-text-secondary mb-1">
              Result:
            </div>
            <div className="text-xs bg-chrome-bg-primary px-2 py-1 rounded text-chrome-text-primary whitespace-pre-wrap max-h-72 overflow-auto font-mono leading-relaxed">
              {tools[currentToolIndex].result || "loading.."}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
