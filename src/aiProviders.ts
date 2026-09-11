import type { AIProvider, AIReasoningEffort, AISettings } from "./types";
import { DEFAULT_AI_SETTINGS } from "./types";

export type AIApiKind =
  | "openai-chat"
  | "openai-responses"
  | "anthropic"
  | "google"
  | "ollama"
  | "azure";

export interface AIProviderSpec {
  id: AIProvider;
  label: string;
  group: string;
  apiKind: AIApiKind;
  defaultBaseUrl: string;
  defaultModel: string;
  models: Array<{ id: string; label: string }>;
  keyRequired: boolean;
  keyPlaceholder: string;
  keyHint: string;
  showBaseUrl: boolean;
  showAzure: boolean;
  showReasoning: boolean;
  canListModels: boolean;
  note: string;
  credentialGroup: AIProvider;
  toolMode: "native" | "text";
}

export const AI_PROVIDER_GROUPS = [
  "Local",
  "OpenAI",
  "Anthropic",
  "Google",
  "Routers",
  "Other",
] as const;

function model(id: string, label = id): { id: string; label: string } {
  return { id, label };
}

type AIProviderSpecInput = Omit<AIProviderSpec, "toolMode"> & {
  toolMode?: AIProviderSpec["toolMode"];
};

function withToolModes(
  catalog: Record<AIProvider, AIProviderSpecInput>
): Record<AIProvider, AIProviderSpec> {
  return Object.fromEntries(
    Object.entries(catalog).map(([id, spec]) => [
      id,
      { ...spec, toolMode: spec.toolMode ?? "native" },
    ])
  ) as Record<AIProvider, AIProviderSpec>;
}

export const AI_PROVIDER_CATALOG: Record<AIProvider, AIProviderSpec> = withToolModes({
  ollama: {
    id: "ollama",
    label: "Ollama",
    group: "Local",
    apiKind: "ollama",
    defaultBaseUrl: "http://localhost:11434",
    defaultModel: "llama3.2",
    models: [
      model("llama3.2", "Llama 3.2"),
      model("llama3.1", "Llama 3.1"),
      model("llama3.3", "Llama 3.3"),
      model("mistral", "Mistral"),
      model("qwen2.5", "Qwen 2.5"),
      model("qwen2.5-coder", "Qwen 2.5 Coder"),
      model("gemma3", "Gemma 3"),
      model("phi4", "Phi 4"),
      model("deepseek-r1", "DeepSeek R1"),
    ],
    keyRequired: false,
    keyPlaceholder: "Not required for local Ollama",
    keyHint: "No API key needed for a local Ollama server.",
    showBaseUrl: true,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "Runs on this machine. If the browser blocks the request, start Ollama with OLLAMA_ORIGINS set to this site (for local development, http://localhost:5173).",
    credentialGroup: "ollama",
  },
  openai: {
    id: "openai",
    label: "OpenAI",
    group: "OpenAI",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.6-luna",
    models: [
      model("gpt-6-astra", "GPT-6 Astra"),
      model("gpt-5.6-sol", "GPT-5.6 Sol"),
      model("gpt-5.6-terra", "GPT-5.6 Terra"),
      model("gpt-5.6-luna", "GPT-5.6 Luna"),
      model("gpt-5.2", "GPT-5.2"),
      model("gpt-4o-mini", "GPT-4o Mini"),
    ],
    keyRequired: true,
    keyPlaceholder: "sk-…",
    keyHint: "From platform.openai.com. Kept in this browser and sent only to OpenAI.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: true,
    canListModels: true,
    note: "Chat Completions for in-character replies. GPT-5.6+ ignore temperature and use reasoning effort instead. Use OpenAI Codex for Codex models.",
    credentialGroup: "openai",
  },
  "openai-codex": {
    id: "openai-codex",
    label: "OpenAI Codex",
    group: "OpenAI",
    apiKind: "openai-responses",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-5.3-codex",
    models: [
      model("gpt-5.3-codex", "GPT-5.3 Codex"),
      model("gpt-5.6-sol", "GPT-5.6 Sol"),
      model("gpt-5.6-terra", "GPT-5.6 Terra"),
    ],
    keyRequired: true,
    keyPlaceholder: "sk-…",
    keyHint: "Same OpenAI API key as Chat Completions. Codex uses the Responses API.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: true,
    canListModels: true,
    note: "Uses /v1/responses. Older gpt-5 / gpt-5.1 / gpt-5.2 Codex IDs are retired; gpt-5.3-codex is the current Codex model.",
    credentialGroup: "openai",
  },
  azure: {
    id: "azure",
    label: "Azure OpenAI",
    group: "OpenAI",
    apiKind: "azure",
    defaultBaseUrl: "https://YOUR-RESOURCE.openai.azure.com",
    defaultModel: "",
    models: [],
    keyRequired: true,
    keyPlaceholder: "Azure API key",
    keyHint: "From the Azure AI Foundry / OpenAI resource Keys and Endpoint page.",
    showBaseUrl: true,
    showAzure: true,
    showReasoning: false,
    canListModels: false,
    note: "Use the Azure resource endpoint, not api.openai.com. The deployment name is the model. A typical GA api-version is 2024-10-21.",
    credentialGroup: "azure",
  },
  anthropic: {
    id: "anthropic",
    label: "Claude",
    group: "Anthropic",
    apiKind: "anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-5",
    models: [
      model("claude-sonnet-5", "Claude Sonnet 5"),
      model("claude-opus-5", "Claude Opus 5"),
      model("claude-fable-5", "Claude Fable 5"),
      model("claude-haiku-4-5", "Claude Haiku 4.5"),
      model("claude-sonnet-4-6", "Claude Sonnet 4.6"),
      model("claude-opus-4-8", "Claude Opus 4.8"),
    ],
    keyRequired: true,
    keyPlaceholder: "sk-ant-…",
    keyHint: "From console.anthropic.com. Sent only to api.anthropic.com.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: true,
    canListModels: true,
    note: "Uses the Messages API. Claude 5 models think adaptively and reject temperature. Some browsers block api.anthropic.com from a local page.",
    credentialGroup: "anthropic",
  },
  google: {
    id: "google",
    label: "Google Gemini",
    group: "Google",
    apiKind: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3.5-flash",
    models: [
      model("gemini-3.6-flash", "Gemini 3.6 Flash"),
      model("gemini-3.5-flash", "Gemini 3.5 Flash"),
      model("gemini-3.1-flash-lite", "Gemini 3.1 Flash-Lite"),
      model("gemini-2.5-flash", "Gemini 2.5 Flash"),
      model("gemini-2.5-pro", "Gemini 2.5 Pro"),
    ],
    keyRequired: true,
    keyPlaceholder: "AIza…",
    keyHint: "From Google AI Studio. The key is sent as a query parameter to Google’s API.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "Uses the Gemini generateContent API. Enable the Generative Language API on the Google Cloud project that owns the key.",
    credentialGroup: "google",
  },
  openrouter: {
    id: "openrouter",
    label: "OpenRouter",
    group: "Routers",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "openai/gpt-4o-mini",
    models: [
      model("openai/gpt-4o-mini", "OpenAI GPT-4o Mini"),
      model("openai/gpt-4o", "OpenAI GPT-4o"),
      model("anthropic/claude-sonnet-5", "Claude Sonnet 5"),
      model("google/gemini-3.5-flash", "Gemini 3.5 Flash"),
      model("meta-llama/llama-3.3-70b-instruct", "Llama 3.3 70B"),
      model("mistralai/mistral-small", "Mistral Small"),
      model("deepseek/deepseek-chat", "DeepSeek Chat"),
    ],
    keyRequired: true,
    keyPlaceholder: "sk-or-…",
    keyHint: "From openrouter.ai. One key reaches many model labs.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "OpenAI-compatible router. Model IDs are vendor/name, for example anthropic/claude-sonnet-5.",
    credentialGroup: "openrouter",
  },
  groq: {
    id: "groq",
    label: "Groq",
    group: "Routers",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    defaultModel: "openai/gpt-oss-120b",
    models: [
      model("openai/gpt-oss-120b", "GPT OSS 120B"),
      model("openai/gpt-oss-20b", "GPT OSS 20B"),
      model("qwen/qwen3.6-27b", "Qwen 3.6 27B"),
    ],
    keyRequired: true,
    keyPlaceholder: "gsk_…",
    keyHint: "From console.groq.com. Fast OpenAI-compatible inference.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "OpenAI-compatible. Current developer-tier chat models are GPT-OSS and Qwen; older Llama IDs return 404.",
    credentialGroup: "groq",
  },
  mistral: {
    id: "mistral",
    label: "Mistral",
    group: "Other",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "mistral-small-latest",
    models: [
      model("mistral-small-latest", "Mistral Small"),
      model("mistral-medium-latest", "Mistral Medium"),
      model("mistral-large-latest", "Mistral Large"),
      model("pixtral-large-latest", "Pixtral Large"),
    ],
    keyRequired: true,
    keyPlaceholder: "Mistral API key",
    keyHint: "From console.mistral.ai.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "OpenAI-compatible Chat Completions on Mistral’s API.",
    credentialGroup: "mistral",
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek",
    group: "Other",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    models: [
      model("deepseek-chat", "DeepSeek Chat"),
      model("deepseek-reasoner", "DeepSeek Reasoner"),
    ],
    keyRequired: true,
    keyPlaceholder: "sk-…",
    keyHint: "From platform.deepseek.com.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: false,
    note: "OpenAI-compatible. Reasoner models think before they speak and may ignore temperature.",
    credentialGroup: "deepseek",
  },
  together: {
    id: "together",
    label: "Together AI",
    group: "Routers",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.together.xyz/v1",
    defaultModel: "meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo",
    models: [
      model("meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo", "Llama 3.1 70B Turbo"),
      model("meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo", "Llama 3.1 8B Turbo"),
      model("mistralai/Mixtral-8x7B-Instruct-v0.1", "Mixtral 8x7B"),
      model("Qwen/Qwen2.5-72B-Instruct-Turbo", "Qwen 2.5 72B"),
    ],
    keyRequired: true,
    keyPlaceholder: "Together API key",
    keyHint: "From api.together.xyz.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "OpenAI-compatible hosted open models.",
    credentialGroup: "together",
  },
  fireworks: {
    id: "fireworks",
    label: "Fireworks",
    group: "Routers",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    models: [
      model("accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B"),
      model("accounts/fireworks/models/llama-v3p1-8b-instruct", "Llama 3.1 8B"),
      model("accounts/fireworks/models/mixtral-8x7b-instruct", "Mixtral 8x7B"),
    ],
    keyRequired: true,
    keyPlaceholder: "Fireworks API key",
    keyHint: "From fireworks.ai.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "OpenAI-compatible. Model IDs are Fireworks account paths.",
    credentialGroup: "fireworks",
  },
  xai: {
    id: "xai",
    label: "xAI Grok",
    group: "Other",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-4",
    models: [
      model("grok-4", "Grok 4"),
      model("grok-3", "Grok 3"),
      model("grok-3-mini", "Grok 3 Mini"),
    ],
    keyRequired: true,
    keyPlaceholder: "xai-…",
    keyHint: "From console.x.ai.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "OpenAI-compatible Grok API.",
    credentialGroup: "xai",
  },
  perplexity: {
    id: "perplexity",
    label: "Perplexity",
    group: "Other",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.perplexity.ai",
    defaultModel: "sonar",
    models: [
      model("sonar", "Sonar"),
      model("sonar-pro", "Sonar Pro"),
      model("sonar-reasoning", "Sonar Reasoning"),
    ],
    keyRequired: true,
    keyPlaceholder: "pplx-…",
    keyHint: "From perplexity.ai/settings/api.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: false,
    note: "OpenAI-compatible. Sonar models can search the web; that is usually more than a tabletop PC needs.",
    credentialGroup: "perplexity",
  },
  cohere: {
    id: "cohere",
    label: "Cohere",
    group: "Other",
    apiKind: "openai-chat",
    defaultBaseUrl: "https://api.cohere.ai/compatibility/v1",
    defaultModel: "command-a-03-2025",
    models: [
      model("command-a-03-2025", "Command A"),
      model("command-r-plus", "Command R+"),
      model("command-r", "Command R"),
      model("command-r7b-12-2024", "Command R7B"),
    ],
    keyRequired: true,
    keyPlaceholder: "Cohere API key",
    keyHint: "From dashboard.cohere.com.",
    showBaseUrl: false,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "Uses Cohere’s OpenAI-compatible Compatibility API.",
    credentialGroup: "cohere",
  },
  custom: {
    id: "custom",
    label: "Custom (OpenAI-compatible)",
    group: "Other",
    apiKind: "openai-chat",
    defaultBaseUrl: "http://127.0.0.1:1234/v1",
    defaultModel: "local-model",
    models: [],
    keyRequired: false,
    keyPlaceholder: "Optional Bearer token",
    keyHint: "LM Studio, vLLM, LiteLLM, and similar servers that expose /v1/chat/completions.",
    showBaseUrl: true,
    showAzure: false,
    showReasoning: false,
    canListModels: true,
    note: "Any OpenAI-compatible /v1 endpoint. Include /v1 in the base URL.",
    credentialGroup: "custom",
  },
});

export function providerSpec(provider: AIProvider): AIProviderSpec {
  return AI_PROVIDER_CATALOG[provider] ?? AI_PROVIDER_CATALOG.custom;
}

export function providersInGroup(group: string): AIProviderSpec[] {
  return (Object.values(AI_PROVIDER_CATALOG) as AIProviderSpec[]).filter(
    (spec) => spec.group === group
  );
}

export function inferProviderFromSettings(settings: Partial<AISettings>): AIProvider {
  if (settings.provider && settings.provider in AI_PROVIDER_CATALOG) {
    return settings.provider;
  }
  const url = (settings.baseUrl ?? "").toLowerCase();
  if (url.includes("11434") || url.includes("ollama")) return "ollama";
  if (url.includes("anthropic")) return "anthropic";
  if (url.includes("googleapis") || url.includes("generativelanguage")) return "google";
  if (url.includes("openrouter")) return "openrouter";
  if (url.includes("groq")) return "groq";
  if (url.includes("mistral")) return "mistral";
  if (url.includes("deepseek")) return "deepseek";
  if (url.includes("together")) return "together";
  if (url.includes("fireworks")) return "fireworks";
  if (url.includes("x.ai")) return "xai";
  if (url.includes("perplexity")) return "perplexity";
  if (url.includes("cohere")) return "cohere";
  if (url.includes("openai.azure.com")) return "azure";
  if (url.includes("api.openai.com")) {
    const model = settings.model ?? "";
    return model.includes("codex") ? "openai-codex" : "openai";
  }
  if (url && url !== DEFAULT_AI_SETTINGS.baseUrl) return "custom";
  return "openai";
}

export function normalizeAISettings(settings: Partial<AISettings> = {}): AISettings {
  const provider = inferProviderFromSettings(settings);
  const spec = providerSpec(provider);
  const savedKeys = { ...(settings.savedKeys ?? {}) };
  const savedModels = { ...(settings.savedModels ?? {}) };
  const savedBaseUrls = { ...(settings.savedBaseUrls ?? {}) };
  if (settings.apiKey?.trim()) {
    savedKeys[spec.credentialGroup] = settings.apiKey;
    savedKeys[provider] = settings.apiKey;
  }
  if (settings.model?.trim()) savedModels[provider] = settings.model;
  if (settings.baseUrl?.trim()) savedBaseUrls[provider] = settings.baseUrl;
  const reasoning = settings.reasoningEffort;
  return {
    ...DEFAULT_AI_SETTINGS,
    ...settings,
    provider,
    baseUrl: settings.baseUrl?.trim() || spec.defaultBaseUrl,
    apiKey: settings.apiKey ?? "",
    model: settings.model?.trim() || spec.defaultModel,
    temperature: clamp(settings.temperature ?? DEFAULT_AI_SETTINGS.temperature, 0, 2),
    maxTokens: Math.round(
      clamp(settings.maxTokens ?? DEFAULT_AI_SETTINGS.maxTokens, 64, 8192)
    ),
    contextWindow: Math.round(
      clamp(settings.contextWindow ?? DEFAULT_AI_SETTINGS.contextWindow, 4, 200)
    ),
    reasoningEffort: (
      ["none", "low", "medium", "high", "xhigh"] as AIReasoningEffort[]
    ).includes(reasoning as AIReasoningEffort)
      ? (reasoning as AIReasoningEffort)
      : "medium",
    extraInstructions: settings.extraInstructions ?? "",
    perceptionRadius:
      Math.round(
        clamp(
          settings.perceptionRadius ?? DEFAULT_AI_SETTINGS.perceptionRadius,
          5,
          300
        ) / 5
      ) * 5,
    loreBudget: Math.round(
      clamp(settings.loreBudget ?? DEFAULT_AI_SETTINGS.loreBudget, 0, 4000)
    ),
    memoryEnabled: settings.memoryEnabled ?? DEFAULT_AI_SETTINGS.memoryEnabled,
    memoryBullets: Math.round(
      clamp(settings.memoryBullets ?? DEFAULT_AI_SETTINGS.memoryBullets, 4, 24)
    ),
    azureDeployment: settings.azureDeployment ?? "",
    azureApiVersion: settings.azureApiVersion || "2024-10-21",
    savedKeys,
    savedModels,
    savedBaseUrls,
  };
}

export function switchAIProvider(
  current: AISettings,
  nextProvider: AIProvider
): AISettings {
  const currentSpec = providerSpec(current.provider);
  const next = providerSpec(nextProvider);
  const savedKeys = {
    ...current.savedKeys,
    [current.provider]: current.apiKey,
    [currentSpec.credentialGroup]: current.apiKey,
  };
  const savedModels = { ...current.savedModels, [current.provider]: current.model };
  const savedBaseUrls = { ...current.savedBaseUrls, [current.provider]: current.baseUrl };
  const apiKey =
    savedKeys[nextProvider] ||
    savedKeys[next.credentialGroup] ||
    (next.credentialGroup === currentSpec.credentialGroup ? current.apiKey : "");
  return normalizeAISettings({
    ...current,
    provider: nextProvider,
    apiKey,
    model: savedModels[nextProvider] || next.defaultModel,
    baseUrl: savedBaseUrls[nextProvider] || next.defaultBaseUrl,
    savedKeys,
    savedModels,
    savedBaseUrls,
  });
}

export function rootUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function ollamaRoot(baseUrl: string): string {
  return rootUrl(baseUrl).replace(/\/v1$/i, "");
}

export function openaiRoot(baseUrl: string): string {
  const trimmed = rootUrl(baseUrl);
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function usesCompletionTokens(model: string): boolean {
  return /^(gpt-[56]|o\d|codex)/i.test(model) || model.includes("codex");
}

export function anthropicUsesAdaptiveEffort(model: string): boolean {
  return /claude-(fable-5|opus-5|sonnet-5|opus-4-[678]|sonnet-4-6)/i.test(model);
}

export function omitTemperature(model: string, kind: AIApiKind): boolean {
  if (kind === "openai-responses") return true;
  if (kind === "anthropic" && anthropicUsesAdaptiveEffort(model)) return true;
  return (
    /^(gpt-[56]|gpt-5\.|o\d|deepseek-reasoner)/i.test(model) ||
    model.includes("codex")
  );
}

function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}
