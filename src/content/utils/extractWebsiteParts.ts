import type { WebsitePart } from "../../shared/types.ts";
import { clearRegistry, registerElement } from "./elementRegistry.ts";

const ignoredSelector = [
  "nav",
  "header",
  "footer",
  "aside",
  "script",
  "style",
  "svg",
  "noscript",
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

const semanticTextSelector = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "li",
  "blockquote",
  "figcaption",
  "td",
  "th",
  "dt",
  "dd",
  "pre",
].join(",");

const broadTextSelector = [
  semanticTextSelector,
  "a",
  "button",
  "label",
  "summary",
  "span",
  "div",
  "section",
  "article",
].join(",");

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

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim();

const getDirectText = (element: Element): string =>
  normalizeText(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ")
  );

const hasExtractableChild = (element: Element): boolean =>
  Array.from(element.children).some((child) => {
    if (!shouldExtractElement(child)) {
      return false;
    }

    const directText = getDirectText(child);
    return directText.length > 0 || child.matches(semanticTextSelector);
  });

const isUsefulTextElement = (element: Element): boolean => {
  if (element.matches(semanticTextSelector)) {
    return true;
  }

  const directText = getDirectText(element);
  if (directText.length >= 2) {
    return true;
  }

  return !hasExtractableChild(element);
};

const getCandidateElements = (rootElement: HTMLElement): Array<Element> => {
  const semanticElements = Array.from(
    rootElement.querySelectorAll(semanticTextSelector)
  ).filter(shouldExtractElement);

  const semanticTextLength = semanticElements.reduce(
    (total, element) => total + normalizeText(element.textContent ?? "").length,
    0
  );

  if (semanticElements.length >= 3 && semanticTextLength >= 200) {
    return semanticElements;
  }

  return Array.from(rootElement.querySelectorAll(broadTextSelector))
    .filter(shouldExtractElement)
    .filter(isUsefulTextElement);
};

const extractWebsiteParts = (rootElement: HTMLElement): Array<WebsitePart> => {
  const elements = getCandidateElements(rootElement);

  clearRegistry();

  const result: Array<WebsitePart> = [];
  let currentSectionId: number = 0;
  let currentPartId: number = 0;
  const seenContent = new Set<string>();

  elements.map((element) => {
    const content = normalizeText(element.textContent ?? "");

    if (seenContent.has(content)) {
      return;
    }
    seenContent.add(content);

    currentPartId++;
    if (/^h[1-6]$/i.test(element.tagName)) {
      currentSectionId++;
      currentPartId = 0;
    }

    const id = `${currentSectionId}-${currentPartId}`;
    registerElement(element, id);

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
