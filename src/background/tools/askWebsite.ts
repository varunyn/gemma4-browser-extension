import {
  ContentTasks,
  PageTextReplacement,
  PageTextReplacementResult,
  WebsitePart,
} from "../../shared/types.ts";
import { WebMCPTool } from "../agent/webMcp.tsx";
import FeatureExtractor from "../utils/FeatureExtractor.ts";

const CONTENT_SCRIPT_FILE = "content.js";
const CONTENT_SCRIPT_MISSING_ERROR = "Receiving end does not exist";

const isInjectablePageUrl = (url?: string): boolean =>
  Boolean(url?.startsWith("http://") || url?.startsWith("https://"));

const isMissingContentScriptError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes(CONTENT_SCRIPT_MISSING_ERROR);

const ensureInjectableTab = async (tabId: number): Promise<chrome.tabs.Tab> => {
  const tab = await chrome.tabs.get(tabId);

  if (!tab.id || !isInjectablePageUrl(tab.url)) {
    throw new Error(
      `Cannot inspect this page. Open a normal http or https webpage first. Current URL: ${tab.url ?? "unknown"}`
    );
  }

  return tab;
};

const sendContentMessage = async <T>(
  tabId: number,
  message: Record<string, any>
): Promise<T> => {
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [CONTENT_SCRIPT_FILE],
    });

    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  }
};

class WebsiteContentManager {
  private currentPageParts: WebsitePart[] = [];
  private featureExtractor: FeatureExtractor;
  private loadingPromise: Promise<void> | null = null;
  private currentTabId: number | null = null;
  private currentUrl: string | null = null;

  constructor(featureExtractor: FeatureExtractor) {
    this.featureExtractor = featureExtractor;
    this.setupListeners();
    this.initializeCurrentTab();
  }

  private async initializeCurrentTab(): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tab?.id && tab.url?.startsWith("http")) {
        this.loadPageForTab(tab.id, tab.url);
      }
    } catch (error) {
      console.error("Failed to initialize current tab:", error);
    }
  }

  private setupListeners(): void {
    chrome.tabs.onActivated.addListener(async (activeInfo) => {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url?.startsWith("http")) {
        this.loadPageForTab(activeInfo.tabId, tab.url);
      }
    });

    chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
      if (changeInfo.status === "complete" && tab.url?.startsWith("http")) {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (activeTab?.id === tabId) {
          this.loadPageForTab(tabId, tab.url);
        }
      }
    });
  }

  private async loadPageForTab(tabId: number, url: string): Promise<void> {
    if (this.currentTabId === tabId && this.currentUrl === url) {
      return;
    }

    this.currentTabId = tabId;
    this.currentUrl = url;

    this.loadCurrentPage().catch((error) => {
      console.error("Failed to load page content:", error);
    });
  }

  async loadCurrentPage(): Promise<void> {
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    this.loadingPromise = this._loadCurrentPageInternal();

    try {
      await this.loadingPromise;
    } finally {
      this.loadingPromise = null;
    }
  }

  private async _loadCurrentPageInternal(): Promise<void> {
    let tabId = this.currentTabId;

    if (!tabId) {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) {
        throw new Error("No active tab found");
      }
      tabId = tab.id;
    }

    await ensureInjectableTab(tabId);
    await new Promise((resolve) => setTimeout(resolve, 500));

    const response = await sendContentMessage<{ parts: Array<WebsitePart> }>(
      tabId,
      {
        type: ContentTasks.EXTRACT_PAGE_DATA,
      }
    );

    const parts = response.parts as Array<WebsitePart>;

    await Promise.all(
      parts.map(async (part, i) => {
        parts[i].embeddings = part.sentences.length
          ? await this.featureExtractor.extractFeatures(part.sentences)
          : [];
      })
    );

    this.currentPageParts = parts;
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    if (vecA.length !== vecB.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async search(query: string, topK: number = 3): Promise<WebsitePart[]> {
    if (this.currentPageParts.length === 0) {
      await this.loadCurrentPage();
    }

    if (this.currentPageParts.length === 0) {
      throw new Error("No content available on the current page");
    }

    const queryEmbedding = await this.featureExtractor.extractFeatures([query]);
    const queryVector = queryEmbedding[0];
    const scoredParts: Array<{ part: WebsitePart; score: number }> = [];

    for (const part of this.currentPageParts) {
      if (!part.embeddings || part.embeddings.length === 0) {
        continue;
      }

      let maxSimilarity = 0;
      for (const sentenceEmbedding of part.embeddings) {
        const similarity = this.cosineSimilarity(
          queryVector,
          sentenceEmbedding
        );
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }

      scoredParts.push({
        part,
        score: maxSimilarity,
      });
    }

    scoredParts.sort((a, b) => b.score - a.score);
    return scoredParts.slice(0, topK).map((item) => item.part);
  }

  async overview(maxParts: number = 20): Promise<WebsitePart[]> {
    if (this.currentPageParts.length === 0) {
      await this.loadCurrentPage();
    }

    if (this.currentPageParts.length === 0) {
      throw new Error("No content available on the current page");
    }

    const headings = this.currentPageParts.filter((part) =>
      /^h[1-6]$/i.test(part.tagName)
    );
    const firstContentParts = this.currentPageParts.filter(
      (part) => part.content.length > 0
    );

    return [...headings, ...firstContentParts]
      .filter(
        (part, index, all) =>
          all.findIndex((candidate) => candidate.id === part.id) === index
      )
      .slice(0, maxParts);
  }

  getCurrentParts(): WebsitePart[] {
    return this.currentPageParts;
  }

  clear(): void {
    this.currentPageParts = [];
  }
}

let websiteContentManager: WebsiteContentManager | null = null;

const isBroadPageOverviewQuery = (query: string): boolean => {
  const normalized = query.toLowerCase();
  return (
    /\b(this|current)\s+(site|page|website)\b/.test(normalized) &&
    /\b(content|about|summary|summarize|overview|tell me)\b/.test(normalized)
  );
};

const formatWebsiteParts = (parts: WebsitePart[]): string => {
  let response =
    "Use only the following current-page excerpts. Do not infer sections or topics that are not shown here.\n\n";

  parts.forEach((part, index) => {
    response += `[${index + 1}] ID: ${part.id} | ${part.tagName.toUpperCase()} (Section ${part.sectionId}, Part ${part.paragraphId}):\n`;
    response += `${part.content}\n\n`;
  });

  response +=
    "Note: You can highlight any of these content pieces by using the highlight_website_element tool with the corresponding ID.";

  return response;
};

export const createAskWebsiteTool = (
  featureExtractor: FeatureExtractor
): WebMCPTool => {
  websiteContentManager = new WebsiteContentManager(featureExtractor);

  return {
    name: "ask_website",
    description:
      "Search and retrieve information from the active/current webpage. Use this first whenever the user asks about this site, this page, the current page, page contents, what a site is about, or asks for a summary of the visible page.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "The user's question about the active/current page",
        },
        topK: {
          type: "number",
          description:
            "Number of relevant content pieces to return (default: 8; use 12-20 for page summaries)",
          default: 8,
        },
      },
      required: ["query"],
    },
    execute: async (args) => {
      const query = args.query as string;
      const topK = (args.topK as number | undefined) ?? 8;

      if (!query || typeof query !== "string") {
        return `Error: query parameter must be a non-empty string. Received: ${JSON.stringify(args)}`;
      }

      if (!websiteContentManager) {
        return "Error: Website content manager not initialized";
      }

      try {
        const results = isBroadPageOverviewQuery(query)
          ? await websiteContentManager.overview(Math.max(topK, 20))
          : await websiteContentManager.search(query, topK);

        if (results.length === 0) {
          return "No relevant content found on the current page.";
        }

        const response = formatWebsiteParts(results);

        console.debug("[gemma4-extension] ask_website result", {
          query,
          topK,
          resultCount: results.length,
          resultIds: results.map(({ id }) => id),
          response,
        });

        return response;
      } catch (error) {
        return `Error searching website content: ${error.toString()}`;
      }
    },
  };
};

export const highlightWebsiteElementTool: WebMCPTool = {
  name: "highlight_website_element",
  description:
    "Highlight a specific content element on the current webpage by its ID. The page will scroll to the element and highlight it with a yellow background. Use this to show the user exactly which part of the page you're referring to.",
  inputSchema: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description:
          "The ID of the content element to highlight (e.g., '1-2'). You can get these IDs from the ask_website tool results.",
      },
    },
    required: ["id"],
  },
  execute: async (args) => {
    const id = args.id as string;

    if (!id || typeof id !== "string") {
      return `Error: id parameter must be a non-empty string. Received: ${JSON.stringify(args)}`;
    }

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        return "Error: No active tab found";
      }

      await ensureInjectableTab(tab.id);
      await sendContentMessage(tab.id, {
        type: ContentTasks.HIGHLIGHT_ELEMENTS,
        payload: {
          id,
        },
      });

      return `Successfully highlighted element with ID: ${id}`;
    } catch (error) {
      return `Error highlighting element: ${error.toString()}`;
    }
  },
};

const isValidReplacement = (value: unknown): value is PageTextReplacement => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const replacement = value as Record<string, unknown>;
  return (
    typeof replacement.id === "string" &&
    replacement.id.trim().length > 0 &&
    typeof replacement.text === "string"
  );
};

export const replacePageTextTool: WebMCPTool = {
  name: "replace_page_text",
  description:
    "Temporarily replace visible text on the active webpage by element ID. Use ask_website first to get IDs, then call this when the user asks to edit, rewrite, simplify, translate, or otherwise change text directly on the page. Changes disappear when the page refreshes.",
  inputSchema: {
    type: "object",
    properties: {
      replacements: {
        type: "array",
        description:
          "Array of replacements. Each item must include id from ask_website and replacement text.",
        items: {
          type: "object",
          properties: {
            id: {
              type: "string",
              description: "The element ID from ask_website, such as 1-2.",
            },
            text: {
              type: "string",
              description: "The new visible text for that element.",
            },
          },
          required: ["id", "text"],
        },
      },
    },
    required: ["replacements"],
  },
  execute: async (args) => {
    const replacements = args.replacements as unknown;

    if (!Array.isArray(replacements) || replacements.length === 0) {
      return "Error: replacements must be a non-empty array of { id, text } objects.";
    }

    const invalidIndex = replacements.findIndex(
      (replacement) => !isValidReplacement(replacement)
    );
    if (invalidIndex !== -1) {
      return `Error: replacement at index ${invalidIndex} must include a non-empty string id and string text.`;
    }

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab.id) {
        return "Error: No active tab found";
      }

      await ensureInjectableTab(tab.id);
      const response = await sendContentMessage<{
        results: PageTextReplacementResult[];
      }>(tab.id, {
        type: ContentTasks.REPLACE_TEXT,
        payload: {
          replacements,
        },
      });

      const succeeded = response.results.filter(({ success }) => success);
      const failed = response.results.filter(({ success }) => !success);

      return JSON.stringify(
        {
          changed: succeeded.length,
          failed: failed.length,
          results: response.results,
          note: "Changes are temporary and will disappear on refresh.",
        },
        null,
        2
      );
    } catch (error) {
      return `Error replacing page text: ${error.toString()}`;
    }
  },
};

export const getWebsiteContentManager = (): WebsiteContentManager | null => {
  return websiteContentManager;
};
