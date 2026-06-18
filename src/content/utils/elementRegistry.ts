// Registry to map between elements and IDs without modifying the DOM
const elementToId = new WeakMap<Element, string>();
const idToElement = new Map<string, Element>();

const nestedTextElementSelector = [
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
  "div",
  "section",
  "article",
  "main",
  "ul",
  "ol",
  "dl",
  "table",
].join(",");

export const registerElement = (element: Element, id: string): void => {
  elementToId.set(element, id);
  idToElement.set(id, element);
};

export const getElementId = (element: Element): string | undefined => {
  return elementToId.get(element);
};

export const getElementById = (id: string): Element | undefined => {
  return idToElement.get(id);
};

export const replaceElementTextById = (
  id: string,
  text: string
): { success: boolean; error?: string } => {
  const element = getElementById(id);

  if (!element) {
    return {
      success: false,
      error: `No extracted element found for ID: ${id}`,
    };
  }

  if (element.querySelector(nestedTextElementSelector)) {
    return {
      success: false,
      error: `Refusing to replace container element ID: ${id}. Use a more specific child text ID from ask_website.`,
    };
  }

  element.textContent = text;
  return { success: true };
};

export const clearRegistry = (): void => {
  idToElement.clear();
};
