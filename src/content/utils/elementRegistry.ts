// Registry to map between elements and IDs without modifying the DOM
const elementToId = new WeakMap<Element, string>();
const idToElement = new Map<string, Element>();

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

  element.textContent = text;
  return { success: true };
};

export const clearRegistry = (): void => {
  idToElement.clear();
};
