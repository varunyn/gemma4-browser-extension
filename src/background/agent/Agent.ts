import {
  AgentMetrics,
  ChatMessage,
  ChatMessageAssistant,
} from "../../shared/types.ts";
import { extractToolCalls } from "./extractToolCalls.ts";
import {
  checkLocalInferenceConnection,
  generateWithLocalInference,
} from "./localInferenceClient.ts";
import { ToolCallPayload } from "./types.ts";
import { WebMCPTool, executeWebMCPTool } from "./webMcp.tsx";

type Message = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  [key: string]: any;
};

type GenerationMetrics = AgentMetrics;
export type AgentRunMetrics = AgentMetrics;

const SYSTEM_PROMPT =
  "You are a helpful assistant with access to external tools declared in this conversation. " +
  "Never claim you do not have tools when tool declarations are present. " +
  "When asked what tools you have, list the declared tool names exactly. " +
  "When the user asks about 'this site', 'this page', 'current page', or page contents, use ask_website on the active tab. " +
  "When the user asks to edit, rewrite, simplify, translate, or otherwise change visible page text in place, call ask_website first and use only the exact element IDs returned by ask_website before calling replace_page_text. Never guess element IDs. " +
  "Use get_open_tabs only when the user asks about tabs or when you truly need to locate a different tab. " +
  "If you decide to use a tool, briefly explain what you are doing before calling it. " +
  "When answering from tool results, use only the concrete facts in those results. " +
  "When replace_page_text changes only a subset of page elements, say it changed those elements; do not claim the entire page was translated or edited. " +
  "Do not invent generic page sections, topics, or summaries that are not present in the tool output.";
const createInitialMessages = (): Array<Message> => [
  {
    role: "system",
    content: SYSTEM_PROMPT,
  },
];
const END_OF_TEXT_TOKEN_REGEX = /<\|end_of_text\|>/g;
const sanitizeModelText = (text: string) =>
  text.replace(END_OF_TEXT_TOKEN_REGEX, "").trim();

const isCurrentPageRequest = (prompt: string): boolean => {
  const normalized = prompt.toLowerCase();
  return (
    /\b(this|current)\s+(site|page|website|tab)\b/.test(normalized) ||
    /\b(page|site|website)\s+content(s)?\b/.test(normalized)
  );
};

const isPageTextMutationRequest = (prompt: string): boolean => {
  const normalized = prompt.toLowerCase();
  return (
    /\b(this|current)\s+(site|page|website|tab)\b/.test(normalized) &&
    /\b(edit|rewrite|replace|change|simplify|translate|localize|reword)\b/.test(
      normalized
    )
  );
};

const createUserPrompt = (prompt: string): string => {
  if (isPageTextMutationRequest(prompt)) {
    return `${prompt}\n\nContext hint: The user wants visible text on the active/current page changed in place. First call ask_website to extract current-page text and element IDs. Then call replace_page_text using only IDs returned by ask_website. Do not guess IDs. The replace_page_text arguments must be exactly shaped like {"replacements":[{"id":"ID_FROM_ASK_WEBSITE","text":"new visible text"}]}.`;
  }

  if (!isCurrentPageRequest(prompt)) {
    return prompt;
  }

  return `${prompt}\n\nContext hint: The user is asking about the active/current page. Use ask_website to inspect the page contents before answering.`;
};

class Agent {
  private messages: Array<Message> = createInitialMessages();
  private _chatMessages: Array<ChatMessage> = [];
  private chatMessagesListener: Array<
    (chatMessages: Array<ChatMessage>) => void
  > = [];
  private tools: Array<WebMCPTool> = [];

  constructor() {}

  get chatMessages() {
    return this._chatMessages;
  }

  set chatMessages(chatMessages: Array<ChatMessage>) {
    this._chatMessages = chatMessages;
    this.chatMessagesListener.forEach((listener) => listener(chatMessages));
  }

  public onChatMessageUpdate(callback: (messages: Array<ChatMessage>) => void) {
    this.chatMessagesListener.push(callback);
  }

  public setTool = (tool: WebMCPTool) => {
    this.tools = [...this.tools, tool];
  };

  public getTextGenerationPipeline = async (
    _onDownloadProgress: (id: string, percentage: number) => void = () => {}
  ) => {
    await checkLocalInferenceConnection();
  };

  public generateText = async (
    prompt: string,
    role: "user" | "tool" = "user",
    onResponseUpdate: (response: string) => void = () => {},
    options: { appendPromptMessage?: boolean } = {}
  ): Promise<{ text: string; metrics: GenerationMetrics }> => {
    const start = performance.now();
    let firstTokenAt: number | null = null;

    if (!this.messages.some(({ role }) => role === "system")) {
      this.messages = [...createInitialMessages(), ...this.messages];
    }

    if (options.appendPromptMessage ?? true) {
      this.messages = [...this.messages, { role, content: prompt }];
    }
    const conversation = [...this.messages];
    const generation = await generateWithLocalInference({
      messages: conversation,
      tools: this.tools,
    });
    firstTokenAt = performance.now();

    const promptLength = generation.promptTokens;
    const generatedTokens = generation.generatedTokens;
    const response = sanitizeModelText(generation.text);
    onResponseUpdate(response);

    this.messages = [...this.messages, { role: "assistant", content: response }];

    const end = performance.now();
    const prefillMs = Math.max(0, (firstTokenAt ?? end) - start);
    const totalMs = Math.max(0, end - start);
    const decodeMs = Math.max(0, totalMs - prefillMs);

    const metrics: GenerationMetrics = {
      generatedTokens,
      prefillTokens: promptLength,
      prefillMs,
      prefillTokensPerSecond:
        prefillMs > 0 ? promptLength / (prefillMs / 1000) : 0,
      decodeMs,
      totalMs,
      tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
      msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
    };

    return { text: response, metrics };
  };

  public runAgent = async (prompt: string): Promise<AgentRunMetrics> => {
    let roleForGeneration: "user" | "tool" = "user";
    let appendPromptMessage = true;
    const start = performance.now();
    let generatedTokens = 0;
    let prefillTokens = 0;
    let prefillMs = 0;
    let decodeMs = 0;

    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", content: prompt },
    ];
    prompt = createUserPrompt(prompt);
    const prevChatMessages = this.chatMessages;
    const assistantMessage: ChatMessageAssistant = {
      role: "assistant",
      content: "",
      tools: [],
      metrics: {
        generatedTokens: 0,
        prefillTokens: 0,
        prefillMs: 0,
        prefillTokensPerSecond: 0,
        decodeMs: 0,
        totalMs: 0,
        tokensPerSecond: 0,
        msPerToken: 0,
      },
    };

    this.chatMessages = [...prevChatMessages, assistantMessage];

    let messageInThisAgentRun = "";
    const updateAssistantMessage = (response: string) => {
      const { toolCalls, message } = extractToolCalls(response);

      toolCalls.map((tool) => {
        if (!Boolean(assistantMessage.tools.find(({ id }) => tool.id === id))) {
          assistantMessage.tools = [
            ...assistantMessage.tools,
            {
              name: tool.name,
              functionSignature: `${tool.name}(${JSON.stringify(
                tool.arguments
              )})`,
              id: tool.id,
              result: "",
            },
          ];
        }
      });

      assistantMessage.content = messageInThisAgentRun + message;

      this.chatMessages = [...prevChatMessages, assistantMessage];
    };

    while (prompt !== null) {
      const generation = await this.generateText(
        prompt,
        roleForGeneration,
        updateAssistantMessage,
        { appendPromptMessage }
      );

      const finalResponse = generation.text;
      generatedTokens += generation.metrics.generatedTokens;
      prefillTokens += generation.metrics.prefillTokens;
      prefillMs += generation.metrics.prefillMs;
      decodeMs += generation.metrics.decodeMs;
      const elapsedMs = Math.max(0, performance.now() - start);
      assistantMessage.metrics = {
        generatedTokens,
        prefillTokens,
        prefillMs,
        prefillTokensPerSecond:
          prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
        decodeMs,
        totalMs: elapsedMs,
        tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
        msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
      };

      const { toolCalls, message } = extractToolCalls(finalResponse);
      messageInThisAgentRun = message;

      if (toolCalls.length === 0) {
        prompt = null;
      } else {
        const toolResponses = await Promise.all(
          toolCalls.map(this.executeToolCall)
        );

        for (let i = this.messages.length - 1; i >= 0; i -= 1) {
          if (this.messages[i].role === "assistant") {
            this.messages[i] = {
              ...this.messages[i],
              content: message,
            };
            break;
          }
        }

        for (let i = this.messages.length - 1; i >= 0; i -= 1) {
          if (this.messages[i].role === "assistant") {
            this.messages[i] = {
              ...this.messages[i],
              tool_calls: toolCalls.map((call) => ({
                id: call.id,
                type: "function",
                function: {
                  name: call.name,
                  arguments: call.arguments,
                },
              })),
            };
            break;
          }
        }

        this.messages = [
          ...this.messages,
          ...toolResponses.map(({ id, name, result }) => ({
            role: "tool" as const,
            tool_call_id: id,
            name,
            content: result,
          })),
        ];

        assistantMessage.tools = assistantMessage.tools.map((tool) => ({
          ...tool,
          result:
            toolResponses.find(({ id }) => id === tool.id)?.result ||
            tool.result,
        }));

        this.chatMessages = [...prevChatMessages, assistantMessage];
        prompt =
          "Use the tool response to answer the user's last request. Include concrete titles, topics, names, or details from the tool output. If the user asked to edit, rewrite, simplify, translate, or otherwise change visible page text in place and ask_website returned page excerpts, call replace_page_text with arguments exactly shaped like {\"replacements\":[{\"id\":\"ID_FROM_ASK_WEBSITE\",\"text\":\"new visible text\"}]}. Use only IDs returned by ask_website. If replace_page_text changed a subset of page elements, say only those elements were changed; do not claim the entire page was translated or edited. If replace_page_text reports missing or unknown element IDs, call ask_website on the active tab before trying replace_page_text again. If the tool output only identifies or navigates browser tabs and the user asked about site/page contents, call ask_website on the active tab before answering. If the tool output is too thin to answer confidently, say what is missing. Do not call tools again unless required.";
        roleForGeneration = "user";
        appendPromptMessage = true;
      }
    }
    const totalMs = Math.max(0, performance.now() - start);
    assistantMessage.metrics = {
      generatedTokens,
      prefillTokens,
      prefillMs,
      prefillTokensPerSecond:
        prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
      decodeMs,
      totalMs,
      tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
      msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
    };
    this.chatMessages = [...prevChatMessages, assistantMessage];

    return {
      generatedTokens,
      prefillTokens,
      prefillMs,
      prefillTokensPerSecond:
        prefillMs > 0 ? prefillTokens / (prefillMs / 1000) : 0,
      decodeMs,
      totalMs,
      tokensPerSecond: decodeMs > 0 ? generatedTokens / (decodeMs / 1000) : 0,
      msPerToken: generatedTokens > 0 ? decodeMs / generatedTokens : 0,
    };
  };

  private executeToolCall = async (
    toolCall: ToolCallPayload
  ): Promise<{ id: string; name: string; result: string }> => {
    const toolToUse = this.tools.find((t) => t.name === toolCall.name);
    if (!toolToUse)
      throw new Error(`Tool '${toolCall.name}' not found or is disabled.`);

    const createToolErrorResult = (error: unknown): string => {
      const message = error instanceof Error ? error.message : String(error);

      if (
        toolCall.name === "replace_page_text" &&
        message.includes("Missing required arguments")
      ) {
        return [
          `Error executing replace_page_text: ${message}.`,
          "Call ask_website on the active tab first to extract current page text and valid element IDs.",
          'Then retry replace_page_text with arguments exactly shaped like {"replacements":[{"id":"ID_FROM_ASK_WEBSITE","text":"new visible text"}]} using only IDs returned by ask_website.',
        ].join(" ");
      }

      return `Error executing ${toolCall.name}: ${message}`;
    };

    let result: string;
    try {
      result = await executeWebMCPTool(toolToUse, toolCall.arguments);
    } catch (error) {
      result = createToolErrorResult(error);
    }

    return {
      id: toolCall.id,
      name: toolCall.name,
      result,
    };
  };

  public clear() {
    this.messages = createInitialMessages();
    this.chatMessages = [];
  }
}

export default Agent;
