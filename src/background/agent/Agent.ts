import {
  AgentMetrics,
  ChatMessage,
  ChatMessageAssistant,
} from "../../shared/types.ts";
import { extractToolCalls } from "./extractToolCalls.ts";
import { checkOmlxConnection, generateWithOmlx } from "./omlxClient.ts";
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
  "Use get_open_tabs only when the user asks about tabs or when you truly need to locate a different tab. " +
  "If you decide to use a tool, briefly explain what you are doing before calling it. " +
  "When answering from tool results, use only the concrete facts in those results. " +
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

const createUserPrompt = (prompt: string): string => {
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
    await checkOmlxConnection();
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
    const generation = await generateWithOmlx({
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
          "Use the tool response to answer the user's last request. Include concrete titles, topics, names, or details from the tool output. If the tool output only identifies or navigates browser tabs and the user asked about site/page contents, call ask_website on the active tab before answering. If the tool output is too thin to answer confidently, say what is missing. Do not call tools again unless required.";
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

    return {
      id: toolCall.id,
      name: toolCall.name,
      result: await executeWebMCPTool(toolToUse, toolCall.arguments),
    };
  };

  public clear() {
    this.messages = createInitialMessages();
    this.chatMessages = [];
  }
}

export default Agent;
