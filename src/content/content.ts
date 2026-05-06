import extractWebsiteParts from "./utils/extractWebsiteParts.ts";
import highlightParagraph from "./utils/highlightParagraph.ts";

const ContentTasks = {
  EXTRACT_PAGE_DATA: 0,
  HIGHLIGHT_ELEMENTS: 1,
  CLEAR_HIGHLIGHTS: 2,
} as const;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === ContentTasks.EXTRACT_PAGE_DATA) {
    const main = (
      document.querySelector("main article") ||
      document.querySelector('[role="main"] article') ||
      document.querySelector("article") ||
      document.querySelector("main") ||
      document.querySelector('[role="main"]') ||
      document.querySelector("body")
    ) as HTMLElement;

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
