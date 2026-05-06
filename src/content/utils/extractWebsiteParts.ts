import type { WebsitePart } from "../../shared/types.ts";
import { clearRegistry, registerElement } from "./elementRegistry.ts";

const ignoredSelector = [
  "nav",
  "header",
  "footer",
  "aside",
  "dialog",
  "menu",
  "[hidden]",
  '[aria-hidden="true"]',
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
].join(",");

const noiseText = new Set([
  "Uh oh!",
  "Sorry, something went wrong.",
  "You don't have any lists yet.",
]);

const isVisible = (element: Element): boolean => {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  const rect = htmlElement.getBoundingClientRect();

  return (
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.opacity !== "0" &&
    rect.width > 0 &&
    rect.height > 0
  );
};

const shouldExtractElement = (element: Element): boolean => {
  const content = element.textContent?.trim() || "";

  if (!content || noiseText.has(content)) {
    return false;
  }

  if (element.closest(ignoredSelector)) {
    return false;
  }

  if (!isVisible(element)) {
    return false;
  }

  return true;
};

const extractWebsiteParts = (rootElement: HTMLElement): Array<WebsitePart> => {
  const elements = Array.from(
    rootElement.querySelectorAll("h1, h2, h3, h4, h5, h6, p, li")
  ).filter(shouldExtractElement);

  clearRegistry();

  const result: Array<WebsitePart> = [];
  let currentSectionId: number = 0;
  let currentPartId: number = 0;

  elements.map((element) => {
    currentPartId++;
    if (/^h[1-6]$/i.test(element.tagName)) {
      currentSectionId++;
      currentPartId = 0;
    }

    const id = `${currentSectionId}-${currentPartId}`;
    registerElement(element, id);

    const content = element.textContent?.replace(/\s+/g, " ").trim() || "";
    const sentences = content
      .split(/(?<=[.!?])\s+/)
      .filter((sentence) => sentence.length > 0);

    const item: WebsitePart = {
      tagName: element.tagName.toLowerCase(),
      id,
      content,
      paragraphId: currentPartId,
      sectionId: currentSectionId,
      sentences,
    };
    result.push(item);
  });

  return result;
};

export default extractWebsiteParts;
