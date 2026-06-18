import extractWebsiteParts from "./utils/extractWebsiteParts.ts";
import { replaceElementTextById } from "./utils/elementRegistry.ts";
import highlightParagraph from "./utils/highlightParagraph.ts";

type TextReplacementMessage = {
  id?: unknown;
  text?: unknown;
};

const ContentTasks = {
  EXTRACT_PAGE_DATA: 0,
  HIGHLIGHT_ELEMENTS: 1,
  CLEAR_HIGHLIGHTS: 2,
  REPLACE_TEXT: 3,
} as const;

const getExtractionRoot = (): HTMLElement => {
  const candidates = [
    document.querySelector("main article"),
    document.querySelector('[role="main"] article'),
    document.querySelector("article"),
    document.querySelector("main"),
    document.querySelector('[role="main"]'),
    document.querySelector("body"),
  ].filter((element): element is HTMLElement => element instanceof HTMLElement);

  const uniqueCandidates = Array.from(new Set(candidates));
  return uniqueCandidates.sort(
    (a, b) => (b.innerText?.trim().length ?? 0) - (a.innerText?.trim().length ?? 0)
  )[0];
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === ContentTasks.EXTRACT_PAGE_DATA) {
    const main = getExtractionRoot();

    const parts = extractWebsiteParts(main);

    console.debug("[gemma4-extension] extracted page parts", {
      root: main?.tagName.toLowerCase(),
      title: document.title,
      url: location.href,
      count: parts.length,
      sample: parts.slice(0, 10).map(({ id, tagName, content }) => ({
        id,
        tagName,
        content,
      })),
    });

    sendResponse({
      parts,
    });
  }

  if (message.type === ContentTasks.HIGHLIGHT_ELEMENTS) {
    highlightParagraph(message.payload.id);
    sendResponse({ success: true });
  }

  if (message.type === ContentTasks.REPLACE_TEXT) {
    const replacements = Array.isArray(message.payload?.replacements)
      ? message.payload.replacements
      : [];
    const results = replacements.map((replacement: TextReplacementMessage) => {
      const id = replacement?.id;
      const text = replacement?.text;

      if (typeof id !== "string" || !id.trim()) {
        return {
          id: String(id ?? ""),
          success: false,
          error: "Replacement id must be a non-empty string",
        };
      }

      if (typeof text !== "string") {
        return {
          id,
          success: false,
          error: "Replacement text must be a string",
        };
      }

      return {
        id,
        ...replaceElementTextById(id, text),
      };
    });

    sendResponse({ results });
  }

  if (message.type === ContentTasks.CLEAR_HIGHLIGHTS) {
    const allElements = document.querySelectorAll('[style*="outline"]');
    allElements.forEach((element) => {
      const htmlElement = element as HTMLElement;
      htmlElement.style.outline = "";
      htmlElement.style.backgroundColor = "";
    });

    sendResponse({ success: true });
  }

  return true;
});
