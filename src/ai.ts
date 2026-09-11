import type {
  AISettings,
  GameplaySettings,
  LogEntry,
  PC,
  SessionMemory,
  TokenCell,
  TokenIntent,
} from "./types";
import {
  anthropicUsesAdaptiveEffort,
  omitTemperature,
  ollamaRoot,
  openaiRoot,
  providerSpec,
  rootUrl,
  usesCompletionTokens,
} from "./aiProviders";
import {
  buildPCPrompt,
  buildSessionMemoryPrompt,
  createEntityHandles,
  parseMemoryBullets,
  type PCContextInput,
} from "./aiContext";
import {
  createPCToolRuntime,
  enabledPCTools,
  type PCToolDefinition,
  type PCToolRuntime,
} from "./pcTools";

export {
  buildPCPrompt,
  compactCharacterContext,
  compactPartyRoster,
  compactSceneContext,
  pendingMemoryCount,
} from "./aiContext";

function assertReady(settings: AISettings) {
  const spec = providerSpec(settings.provider);
  if (spec.keyRequired && !settings.apiKey.trim()) {
    throw new Error(
      `No ${spec.label} API key set. Open Settings (gear icon) and add one.`
    );
  }
  if (spec.apiKind === "azure" && !settings.azureDeployment.trim()) {
    throw new Error("Azure OpenAI needs a deployment name in Settings.");
  }
  if (!settings.model.trim()) {
    throw new Error(
      spec.apiKind === "azure"
        ? "Azure OpenAI needs the deployed model ID in Settings."
        : "Choose a model in Settings."
    );
  }
}

/**
 * Runs one character's turn. Every request is independent: this PC gets its own
 * sheet, its own view of the map, and the shared console history.
 */
export interface PCTurnInput extends PCContextInput {
  gameplay: GameplaySettings;
  emitIntent: (intent: Omit<TokenIntent, "id" | "createdAt" | "status">) => void;
  say: (text: string) => void;
  emote: (text: string) => void;
  updatePC: (patch: Partial<PC>) => void;
  getLiveState: () => { pc: PC; party: PC[]; tokens: PCContextInput["tokens"] };
  movePC: (cell: TokenCell) => void;
  rollCheck: (checkId: string, reason: string) => Promise<string>;
  endTurn?: () => boolean;
  onUsageEstimate?: (inputTokens: number, loreEntries: number) => void;
}

export async function generatePCResponse(input: PCTurnInput): Promise<string> {
  assertReady(input.settings);
  const handles = createEntityHandles(input.pc, input.party, input.tokens);
  const promptInput = {
    ...input,
    handles,
    useSheetTools: input.gameplay.toolsEnabled,
  };
  const { system, user, estimatedTokens, loreEntries } = buildPCPrompt(promptInput);
  input.onUsageEstimate?.(estimatedTokens, loreEntries);
  const tools = enabledPCTools(input.gameplay);
  if (!tools.length) {
    const plain = await completeChat(input.settings, system, user);
    if (!plain) throw new Error("AI returned an empty response.");
    return plain.trim();
  }
  const runtime = createPCToolRuntime(promptInput, input.gameplay, {
    emitIntent: input.emitIntent,
    say: input.say,
    emote: input.emote,
    updatePC: input.updatePC,
    getLiveState: input.getLiveState,
    movePC: input.movePC,
    rollCheck: input.rollCheck,
    endTurn: input.endTurn,
  });
  const result = await runToolLoop(
    input.settings,
    `${system}\n\nFUNCTIONS:\nUse functions to inspect exact data and declare actions. Never invent a function result. Use say or emote for in-character output, and do not repeat delivered words in your final text.`,
    user,
    tools,
    runtime,
    input.gameplay.maxToolSteps
  );
  const text = result.text.trim();
  if (!text && result.calls === 0) throw new Error("AI returned an empty response.");
  return text.trim();
}

/**
 * Folds console history that has aged out of the verbatim window into the
 * rolling session digest. Returns null when there is nothing new to fold.
 */
export async function summarizeSession(
  log: LogEntry[],
  memory: SessionMemory,
  settings: AISettings,
  campaignName: string
): Promise<SessionMemory | null> {
  const prompt = buildSessionMemoryPrompt(log, memory, settings, campaignName);
  if (!prompt) return null;
  assertReady(settings);
  const text = await completeChat(
    {
      ...settings,
      temperature: Math.min(settings.temperature, 0.3),
      maxTokens: Math.min(Math.max(settings.memoryBullets * 48, 256), 1024),
      reasoningEffort: "none",
    },
    prompt.system,
    prompt.user
  );
  const bullets = parseMemoryBullets(text, settings.memoryBullets);
  if (!bullets.length) return null;
  return {
    bullets,
    throughLogId: prompt.throughLogId,
    coveredCount: prompt.coveredCount,
    updatedAt: Date.now(),
  };
}

async function completeChat(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const spec = providerSpec(settings.provider);
  switch (spec.apiKind) {
    case "ollama":
      return completeOllama(settings, system, user);
    case "anthropic":
      return completeAnthropic(settings, system, user);
    case "google":
      return completeGoogle(settings, system, user);
    case "openai-responses":
      return completeOpenAIResponses(settings, system, user);
    case "azure":
      return completeAzure(settings, system, user);
    default:
      return completeOpenAIChat(settings, system, user);
  }
}

async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return `AI request failed (${res.status}): ${body.slice(0, 300) || res.statusText}`;
}

function chatMessages(system: string, user: string) {
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

interface NormalizedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

interface NormalizedToolResult {
  callId: string;
  name: string;
  content: string;
}

interface ToolLoopMessage {
  role: "user" | "assistant";
  text?: string;
  calls?: NormalizedToolCall[];
  results?: NormalizedToolResult[];
  providerData?: unknown;
}

interface ToolReply {
  text: string;
  calls: NormalizedToolCall[];
  providerData?: unknown;
}

interface ToolLoopResult {
  text: string;
  protocol: "native" | "text";
  calls: number;
}

function parseToolArguments(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function openAITools(tools: PCToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

function responseTools(tools: PCToolDefinition[]) {
  return tools.map((tool) => ({
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

function serializeOpenAIMessages(system: string, messages: ToolLoopMessage[]) {
  const output: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "assistant") {
      if (
        message.providerData &&
        typeof message.providerData === "object" &&
        !Array.isArray(message.providerData)
      ) {
        output.push(message.providerData as Record<string, unknown>);
        continue;
      }
      output.push({
        role: "assistant",
        content: message.text || null,
        ...(message.calls?.length
          ? {
              tool_calls: message.calls.map((call) => ({
                id: call.id,
                type: "function",
                function: { name: call.name, arguments: JSON.stringify(call.args) },
              })),
            }
          : {}),
      });
      continue;
    }
    if (message.results?.length) {
      output.push(
        ...message.results.map((result) => ({
          role: "tool",
          tool_call_id: result.callId,
          name: result.name,
          content: result.content,
        }))
      );
    } else {
      output.push({ role: "user", content: message.text ?? "" });
    }
  }
  return output;
}

function serializeOllamaMessages(system: string, messages: ToolLoopMessage[]) {
  const output: Array<Record<string, unknown>> = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "assistant") {
      output.push({
        role: "assistant",
        content: message.text ?? "",
        ...(message.calls?.length
          ? {
              tool_calls: message.calls.map((call) => ({
                function: { name: call.name, arguments: call.args },
              })),
            }
          : {}),
      });
    } else if (message.results?.length) {
      output.push(
        ...message.results.map((result) => ({
          role: "tool",
          tool_name: result.name,
          content: result.content,
        }))
      );
    } else {
      output.push({ role: "user", content: message.text ?? "" });
    }
  }
  return output;
}

function serializeAnthropicMessages(messages: ToolLoopMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: Array.isArray(message.providerData)
          ? message.providerData
          : [
              ...(message.text ? [{ type: "text", text: message.text }] : []),
              ...(message.calls ?? []).map((call) => ({
                type: "tool_use",
                id: call.id,
                name: call.name,
                input: call.args,
              })),
            ],
      };
    }
    if (message.results?.length) {
      return {
        role: "user",
        content: message.results.map((result) => ({
          type: "tool_result",
          tool_use_id: result.callId,
          content: result.content,
        })),
      };
    }
    return { role: "user", content: message.text ?? "" };
  });
}

function serializeGoogleMessages(messages: ToolLoopMessage[]) {
  return messages.map((message) => {
    if (message.role === "assistant") {
      return {
        role: "model",
        parts: Array.isArray(message.providerData)
          ? message.providerData
          : [
              ...(message.text ? [{ text: message.text }] : []),
              ...(message.calls ?? []).map((call) => ({
                functionCall: { name: call.name, args: call.args, id: call.id },
              })),
            ],
      };
    }
    if (message.results?.length) {
      return {
        role: "user",
        parts: message.results.map((result) => ({
          functionResponse: {
            id: result.callId,
            name: result.name,
            response: { result: result.content },
          },
        })),
      };
    }
    return { role: "user", parts: [{ text: message.text ?? "" }] };
  });
}

function serializeResponsesInput(messages: ToolLoopMessage[]) {
  const output: Array<Record<string, unknown>> = [];
  for (const message of messages) {
    if (message.role === "assistant") {
      if (message.text) output.push({ role: "assistant", content: message.text });
      output.push(
        ...(message.calls ?? []).map((call) => ({
          type: "function_call",
          call_id: call.id,
          name: call.name,
          arguments: JSON.stringify(call.args),
        }))
      );
    } else if (message.results?.length) {
      output.push(
        ...message.results.map((result) => ({
          type: "function_call_output",
          call_id: result.callId,
          output: result.content,
        }))
      );
    } else {
      output.push({ role: "user", content: message.text ?? "" });
    }
  }
  return output;
}

function applyChatGeneration(
  body: Record<string, unknown>,
  settings: AISettings,
  kind: ReturnType<typeof providerSpec>["apiKind"]
) {
  const effectiveModel =
    kind === "azure" ? settings.model || settings.azureDeployment : settings.model;
  if (!omitTemperature(effectiveModel, kind)) body.temperature = settings.temperature;
  if (usesCompletionTokens(effectiveModel)) {
    body.max_completion_tokens = settings.maxTokens;
    if (settings.reasoningEffort !== "none") body.reasoning_effort = settings.reasoningEffort;
  } else {
    body.max_tokens = settings.maxTokens;
  }
}

async function requestOpenAIStyleTools(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[],
  azure = false
): Promise<ToolReply> {
  const spec = providerSpec(settings.provider);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  let url: string;
  if (azure) {
    const deployment = encodeURIComponent(settings.azureDeployment.trim());
    const version = encodeURIComponent(settings.azureApiVersion.trim() || "2024-10-21");
    url = `${rootUrl(settings.baseUrl)}/openai/deployments/${deployment}/chat/completions?api-version=${version}`;
    headers["api-key"] = settings.apiKey;
  } else {
    url = `${openaiRoot(settings.baseUrl)}/chat/completions`;
    if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey}`;
    if (settings.provider === "openrouter") {
      headers["HTTP-Referer"] = window.location.origin;
      headers["X-Title"] = "RAM";
    }
  }
  const body: Record<string, unknown> = {
    messages: serializeOpenAIMessages(system, messages),
    tools: openAITools(tools),
    tool_choice: "auto",
  };
  if (!azure) body.model = settings.model;
  applyChatGeneration(body, settings, spec.apiKind);
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  const calls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.map((call: any, index: number) => ({
        id: String(call?.id || `call_${Date.now()}_${index}`),
        name: String(call?.function?.name ?? ""),
        args: parseToolArguments(call?.function?.arguments),
      }))
    : [];
  return {
    text: typeof message?.content === "string" ? message.content : "",
    calls,
    providerData:
      message && typeof message === "object" ? { ...message, role: "assistant" } : undefined,
  };
}

async function requestOllamaTools(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[]
): Promise<ToolReply> {
  const res = await fetch(`${ollamaRoot(settings.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: serializeOllamaMessages(system, messages),
      tools: openAITools(tools),
      options: { temperature: settings.temperature, num_predict: settings.maxTokens },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const message = data?.message;
  const calls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.map((call: any, index: number) => ({
        id: String(call?.id || `ollama_${Date.now()}_${index}`),
        name: String(call?.function?.name ?? ""),
        args: parseToolArguments(call?.function?.arguments),
      }))
    : [];
  return { text: typeof message?.content === "string" ? message.content : "", calls };
}

async function requestAnthropicTools(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[]
): Promise<ToolReply> {
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    system,
    messages: serializeAnthropicMessages(messages),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.parameters,
    })),
  };
  if (anthropicUsesAdaptiveEffort(settings.model)) {
    body.thinking =
      settings.reasoningEffort === "none"
        ? { type: "disabled" }
        : { type: "adaptive" };
    if (settings.reasoningEffort !== "none") {
      body.output_config = { effort: settings.reasoningEffort };
    }
  } else {
    body.temperature = settings.temperature;
  }
  const res = await fetch(`${rootUrl(settings.baseUrl)}/v1/messages`, {
    method: "POST",
    headers: anthropicHeaders(settings.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const parts = Array.isArray(data?.content) ? data.content : [];
  return {
    text: parts
      .filter((part: any) => part?.type === "text")
      .map((part: any) => String(part.text ?? ""))
      .join(""),
    calls: parts
      .filter((part: any) => part?.type === "tool_use")
      .map((part: any, index: number) => ({
        id: String(part.id || `anthropic_${Date.now()}_${index}`),
        name: String(part.name ?? ""),
        args: parseToolArguments(part.input),
      })),
    providerData: parts,
  };
}

async function requestGoogleTools(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[]
): Promise<ToolReply> {
  const model = encodeURIComponent(settings.model);
  const key = encodeURIComponent(settings.apiKey);
  const res = await fetch(
    `${rootUrl(settings.baseUrl)}/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: serializeGoogleMessages(messages),
        tools: [
          {
            functionDeclarations: tools.map((tool) => ({
              name: tool.name,
              description: tool.description,
              parameters: tool.parameters,
            })),
          },
        ],
        generationConfig: {
          temperature: settings.temperature,
          maxOutputTokens: settings.maxTokens,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return { text: "", calls: [] };
  return {
    text: parts.map((part: any) => (typeof part?.text === "string" ? part.text : "")).join(""),
    calls: parts
      .filter((part: any) => part?.functionCall)
      .map((part: any, index: number) => ({
        id: String(part.functionCall.id || `google_${Date.now()}_${index}`),
        name: String(part.functionCall.name ?? ""),
        args: parseToolArguments(part.functionCall.args),
      })),
    providerData: parts,
  };
}

async function requestResponsesTools(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[]
): Promise<ToolReply> {
  const priorResponse = [...messages]
    .reverse()
    .map((message) => message.providerData)
    .find(
      (value): value is { responseId: string } =>
        Boolean(
          value &&
            typeof value === "object" &&
            "responseId" in value &&
            typeof (value as { responseId?: unknown }).responseId === "string"
        )
    );
  const latest = messages[messages.length - 1];
  const body: Record<string, unknown> = {
    model: settings.model,
    instructions: system,
    input: serializeResponsesInput(priorResponse && latest ? [latest] : messages),
    tools: responseTools(tools),
    max_output_tokens: settings.maxTokens,
  };
  if (priorResponse) body.previous_response_id = priorResponse.responseId;
  if (settings.reasoningEffort !== "none") {
    body.reasoning = { effort: settings.reasoningEffort };
  }
  const res = await fetch(`${openaiRoot(settings.baseUrl)}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const output = Array.isArray(data?.output) ? data.output : [];
  const text = output
    .flatMap((item: any) => (Array.isArray(item?.content) ? item.content : []))
    .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
    .join("");
  return {
    text: typeof data?.output_text === "string" ? data.output_text : text,
    calls: output
      .filter((item: any) => item?.type === "function_call")
      .map((item: any, index: number) => ({
        id: String(item.call_id || item.id || `response_${Date.now()}_${index}`),
        name: String(item.name ?? ""),
        args: parseToolArguments(item.arguments),
      })),
    providerData: { responseId: String(data?.id ?? "") },
  };
}

async function requestNativeToolReply(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[]
): Promise<ToolReply> {
  switch (providerSpec(settings.provider).apiKind) {
    case "openai-responses":
      return requestResponsesTools(settings, system, messages, tools);
    case "anthropic":
      return requestAnthropicTools(settings, system, messages, tools);
    case "google":
      return requestGoogleTools(settings, system, messages, tools);
    case "ollama":
      return requestOllamaTools(settings, system, messages, tools);
    case "azure":
      return requestOpenAIStyleTools(settings, system, messages, tools, true);
    default:
      return requestOpenAIStyleTools(settings, system, messages, tools);
  }
}

function renderTextProtocol(messages: ToolLoopMessage[]): string {
  return messages
    .map((message) => {
      if (message.role === "assistant") {
        return `ASSISTANT:\n${message.text ?? ""}${(message.calls ?? [])
          .map((call) => `\n<call name="${call.name}">${JSON.stringify(call.args)}</call>`)
          .join("")}`;
      }
      if (message.results?.length) {
        return `TOOL RESULTS:\n${message.results
          .map((result) => `${result.name}: ${result.content}`)
          .join("\n")}`;
      }
      return `USER:\n${message.text ?? ""}`;
    })
    .join("\n\n");
}

async function requestTextToolReply(
  settings: AISettings,
  system: string,
  messages: ToolLoopMessage[],
  tools: PCToolDefinition[]
): Promise<ToolReply> {
  const catalog = tools
    .map(
      (tool) =>
        `${tool.name}: ${tool.description}\nPARAMETERS ${JSON.stringify(tool.parameters)}`
    )
    .join("\n\n");
  const protocol = [
    system,
    "TOOL PROTOCOL:",
    "To call a function, output exactly <call name=\"function_name\">{\"argument\":\"value\"}</call>.",
    "You may emit multiple call tags. Do not put Markdown around them. After tool results arrive, continue normally or call another function.",
    `AVAILABLE FUNCTIONS:\n${catalog}`,
  ].join("\n\n");
  const raw = await completeChat(settings, protocol, renderTextProtocol(messages));
  const calls: NormalizedToolCall[] = [];
  const pattern = /<call\s+name=["']([^"']+)["']\s*>([\s\S]*?)<\/call>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw))) {
    calls.push({
      id: `text_${Date.now()}_${calls.length}`,
      name: match[1].trim(),
      args: parseToolArguments(match[2]),
    });
  }
  return { text: raw.replace(pattern, "").trim(), calls };
}

async function runToolLoop(
  settings: AISettings,
  system: string,
  user: string,
  tools: PCToolDefinition[],
  runtime: PCToolRuntime,
  maxSteps: number
): Promise<ToolLoopResult> {
  const messages: ToolLoopMessage[] = [{ role: "user", text: user }];
  const registry = new Map(tools.map((tool) => [tool.name, tool]));
  let protocol: "native" | "text" =
    providerSpec(settings.provider).toolMode === "text" ? "text" : "native";
  let didFallback = false;
  let totalCalls = 0;
  for (let step = 0; step <= maxSteps; step += 1) {
    let reply: ToolReply;
    try {
      reply =
        protocol === "native"
          ? await requestNativeToolReply(settings, system, messages, tools)
          : await requestTextToolReply(settings, system, messages, tools);
    } catch (error) {
      if (protocol === "native" && !didFallback) {
        protocol = "text";
        didFallback = true;
        continue;
      }
      throw error;
    }
    if (!reply.calls.length) {
      return { text: reply.text, protocol, calls: totalCalls };
    }
    if (step === maxSteps) {
      throw new Error(`AI exceeded the ${maxSteps}-step function limit.`);
    }
    totalCalls += reply.calls.length;
    if (totalCalls > maxSteps * 4) {
      throw new Error("AI made too many function calls in one turn.");
    }
    messages.push({
      role: "assistant",
      text: reply.text,
      calls: reply.calls,
      providerData: reply.providerData,
    });
    const results: NormalizedToolResult[] = [];
    for (const call of reply.calls) {
      const tool = registry.get(call.name);
      let content: string;
      if (!tool) {
        content = `ERROR|unknown function ${call.name}`;
      } else {
        try {
          content = await tool.run(call.args, runtime);
        } catch (error) {
          content = `ERROR|${error instanceof Error ? error.message : String(error)}`;
        }
      }
      results.push({ callId: call.id, name: call.name, content });
    }
    messages.push({ role: "user", results });
  }
  throw new Error("AI function loop stopped unexpectedly.");
}

export async function testAITools(settings: AISettings): Promise<string> {
  assertReady(settings);
  let called = false;
  const ping: PCToolDefinition = {
    name: "ping",
    description: "Return a fixed pong value. You must call this function once.",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    tier: "always",
    autonomy: "query",
    run: () => {
      called = true;
      return "PING|pong";
    },
  };
  const result = await runToolLoop(
    { ...settings, maxTokens: Math.max(128, Math.min(settings.maxTokens, 256)) },
    "You are a function calling test. Call ping exactly once, then reply ready.",
    "Call ping now.",
    [ping],
    {} as PCToolRuntime,
    2
  );
  if (!called) throw new Error("The provider replied but did not call the ping function.");
  return `Function calling ready via ${result.protocol === "native" ? "native tools" : "text fallback"}.`;
}

async function completeOpenAIChat(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const spec = providerSpec(settings.provider);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (settings.apiKey.trim()) {
    headers.Authorization = `Bearer ${settings.apiKey}`;
  }
  if (settings.provider === "openrouter") {
    headers["HTTP-Referer"] = window.location.origin;
    headers["X-Title"] = "RAM";
  }
  const body: Record<string, unknown> = {
    model: settings.model,
    messages: chatMessages(system, user),
  };
  if (!omitTemperature(settings.model, spec.apiKind)) {
    body.temperature = settings.temperature;
  }
  if (usesCompletionTokens(settings.model)) {
    body.max_completion_tokens = settings.maxTokens;
    if (settings.reasoningEffort !== "none") {
      body.reasoning_effort = settings.reasoningEffort;
    }
  } else {
    body.max_tokens = settings.maxTokens;
  }
  const res = await fetch(`${openaiRoot(settings.baseUrl)}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const text: unknown = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : "";
}

async function completeOpenAIResponses(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${settings.apiKey}`,
  };
  const body: Record<string, unknown> = {
    model: settings.model,
    instructions: system,
    input: user,
    max_output_tokens: settings.maxTokens,
  };
  if (settings.reasoningEffort !== "none") {
    body.reasoning = { effort: settings.reasoningEffort };
  }
  const res = await fetch(`${openaiRoot(settings.baseUrl)}/responses`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text;
  }
  const chunks = Array.isArray(data?.output) ? data.output : [];
  const texts: string[] = [];
  for (const item of chunks) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string") texts.push(part.text);
    }
  }
  return texts.join("").trim();
}

async function completeAzure(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const deployment = encodeURIComponent(settings.azureDeployment.trim());
  const version = encodeURIComponent(settings.azureApiVersion.trim() || "2024-10-21");
  const url = `${rootUrl(settings.baseUrl)}/openai/deployments/${deployment}/chat/completions?api-version=${version}`;
  const body: Record<string, unknown> = {
    messages: chatMessages(system, user),
  };
  const effectiveModel = settings.model || settings.azureDeployment;
  if (usesCompletionTokens(effectiveModel)) {
    body.max_completion_tokens = settings.maxTokens;
    if (settings.reasoningEffort !== "none") {
      body.reasoning_effort = settings.reasoningEffort;
    }
  } else {
    body.max_tokens = settings.maxTokens;
  }
  if (!omitTemperature(effectiveModel, "azure")) {
    body.temperature = settings.temperature;
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": settings.apiKey,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const text: unknown = data?.choices?.[0]?.message?.content;
  return typeof text === "string" ? text : "";
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
}

async function completeAnthropic(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const body: Record<string, unknown> = {
    model: settings.model,
    max_tokens: settings.maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  if (anthropicUsesAdaptiveEffort(settings.model)) {
    if (settings.reasoningEffort === "none") {
      body.thinking = { type: "disabled" };
    } else {
      body.thinking = { type: "adaptive" };
      body.output_config = { effort: settings.reasoningEffort };
    }
  } else {
    body.temperature = settings.temperature;
  }
  const res = await fetch(`${rootUrl(settings.baseUrl)}/v1/messages`, {
    method: "POST",
    headers: anthropicHeaders(settings.apiKey),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const parts = Array.isArray(data?.content) ? data.content : [];
  return parts
    .map((part: { type?: string; text?: string }) =>
      part?.type === "text" ? (part.text ?? "") : ""
    )
    .join("")
    .trim();
}

async function completeGoogle(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const model = encodeURIComponent(settings.model);
  const key = encodeURIComponent(settings.apiKey);
  const res = await fetch(
    `${rootUrl(settings.baseUrl)}/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
          temperature: settings.temperature,
          maxOutputTokens: settings.maxTokens,
        },
      }),
    }
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts.map((part: { text?: string }) => part?.text ?? "").join("").trim();
}

async function completeOllama(
  settings: AISettings,
  system: string,
  user: string
): Promise<string> {
  const res = await fetch(`${ollamaRoot(settings.baseUrl)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages: chatMessages(system, user),
      options: {
        temperature: settings.temperature,
        num_predict: settings.maxTokens,
      },
    }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  const text: unknown = data?.message?.content;
  return typeof text === "string" ? text : "";
}

export async function listProviderModels(settings: AISettings): Promise<string[]> {
  const spec = providerSpec(settings.provider);
  if (spec.apiKind === "ollama") {
    const res = await fetch(`${ollamaRoot(settings.baseUrl)}/api/tags`);
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const names = Array.isArray(data?.models)
      ? data.models.map((entry: { name?: string }) => entry?.name).filter(Boolean)
      : [];
    return [...new Set(names as string[])].sort();
  }
  if (spec.apiKind === "google") {
    const res = await fetch(
      `${rootUrl(settings.baseUrl)}/models?key=${encodeURIComponent(settings.apiKey)}`
    );
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const names = Array.isArray(data?.models)
      ? data.models
          .map((entry: { name?: string }) =>
            String(entry?.name ?? "").replace(/^models\//, "")
          )
          .filter((name: string) => name.includes("gemini"))
      : [];
    return [...new Set(names as string[])].sort();
  }
  if (spec.apiKind === "anthropic") {
    const res = await fetch(`${rootUrl(settings.baseUrl)}/v1/models`, {
      headers: anthropicHeaders(settings.apiKey),
    });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const names = Array.isArray(data?.data)
      ? data.data.map((entry: { id?: string }) => entry?.id).filter(Boolean)
      : [];
    return [...new Set(names as string[])].sort();
  }
  if (spec.apiKind === "openai-chat" || spec.apiKind === "openai-responses") {
    const headers: Record<string, string> = {};
    if (settings.apiKey.trim()) headers.Authorization = `Bearer ${settings.apiKey}`;
    const res = await fetch(`${openaiRoot(settings.baseUrl)}/models`, { headers });
    if (!res.ok) throw new Error(await readError(res));
    const data = await res.json();
    const names = Array.isArray(data?.data)
      ? data.data.map((entry: { id?: string }) => entry?.id).filter(Boolean)
      : [];
    return [...new Set(names as string[])].sort();
  }
  throw new Error(`${spec.label} does not publish a model list from this app.`);
}

export async function testAIConnection(settings: AISettings): Promise<string> {
  const spec = providerSpec(settings.provider);
  if (spec.apiKind === "ollama") {
    const models = await listProviderModels(settings);
    return models.length
      ? `Connected to Ollama. ${models.length} model${models.length === 1 ? "" : "s"} installed.`
      : "Connected to Ollama, but no models are installed. Run `ollama pull llama3.2`.";
  }
  if (spec.keyRequired && !settings.apiKey.trim()) {
    throw new Error(`Add ${/^[aeiou]/i.test(spec.label) ? "an" : "a"} ${spec.label} API key first.`);
  }
  const text = await completeChat(
    {
      ...settings,
      maxTokens: Math.min(Math.max(settings.maxTokens, 64), 128),
      reasoningEffort: "none",
    },
    "You are a connection test. Reply with the single word ready.",
    "Reply with ready."
  );
  if (!text.trim()) throw new Error("The provider responded, but the message was empty.");
  return `Connected to ${spec.label} with ${settings.model}.`;
}
