import type { AISettings, LibraryItem, LogEntry, PC, RuleDefinition } from "./types";
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
  abilityMod,
  activeCreatureRules,
  calculateCreatureStats,
  formatMod,
  parseContainedItem,
  resolvedCreatureProfile,
} from "./types";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function addLine(lines: string[], key: string, values: string[]) {
  const compact = [...new Set(values.map(compactText).filter(Boolean))];
  if (compact.length) lines.push(`${key}|${compact.join(";")}`);
}

function itemName(id: string, libraryItems: LibraryItem[]): string {
  return libraryItems.find((entry) => entry.id === id)?.name ?? id.replace(/^item-/, "");
}

function packedName(entry: string, libraryItems: LibraryItem[]): string {
  const { libraryItemId, qty } = parseContainedItem(entry);
  const name = itemName(libraryItemId, libraryItems);
  return qty > 1 ? `${name}×${qty}` : name;
}

function gearMechanics(catalog: LibraryItem, libraryItems: LibraryItem[]): string {
  const pack = (catalog.contains ?? [])
    .map((id) => packedName(id, libraryItems))
    .filter(Boolean);
  const description = compactText(catalog.description);
  return [
    catalog.damage
      ? `dmg=${catalog.damage}${catalog.damageType ? ` ${catalog.damageType}` : ""}`
      : "",
    catalog.armorClass ? `AC=${catalog.armorClass}/${catalog.armorDexterity}` : "",
    catalog.armorBonus ? `ACbonus=${formatMod(catalog.armorBonus)}` : "",
    catalog.properties.length ? `prop=${catalog.properties.join(",")}` : "",
    pack.length ? `pack=${pack.join("+")}` : "",
    description && !description.startsWith("Contains ") ? description : "",
  ]
    .filter(Boolean)
    .join(",");
}

function notesAreCovered(notes: string, features: { name: string; effect: string }[]): boolean {
  const compactNotes = compactText(notes);
  if (!compactNotes) return true;
  return features.some((feature) => {
    const effect = compactText(feature.effect);
    const labeled = compactText(`${feature.name}: ${feature.effect}`);
    return compactNotes === effect || compactNotes === labeled;
  });
}

/**
 * Produces a compact, deterministic character packet for an AI PC.
 * It excludes UI/persistence data while retaining selected rules, derived stats,
 * equipment mechanics, statuses, roleplay details, and user-authored text.
 */
export function compactCharacterContext(
  pc: PC,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): string {
  const activeRules = activeCreatureRules(pc, rules);
  const calculated = calculateCreatureStats(pc, rules, libraryItems);
  const profile = resolvedCreatureProfile(pc, rules);
  const chosenAbilityBonus = (ability: (typeof ABILITIES)[number]) =>
    activeRules.reduce(
      (sum, entry) =>
        sum +
        (entry.choices ?? [])
          .filter((choice) => choice.target === "ability")
          .reduce(
            (choiceSum, choice) =>
              choiceSum +
              (pc.ruleChoices?.[`${entry.id}:${choice.id}`] ?? []).filter(
                (value) => value === ability
              ).length *
                (choice.bonus ?? 1),
            0
          ),
      0
    );
  const effectiveAbilities = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      pc.abilities[ability] +
        activeRules.reduce(
          (sum, entry) => sum + (entry.abilityBonuses[ability] ?? 0),
          0
        ) +
        chosenAbilityBonus(ability),
    ])
  ) as Record<(typeof ABILITIES)[number], number>;
  const identityRules = activeRules.map((entry) => `${entry.kind}=${entry.name}`);
  const lines = [
    "FMT|*eq;-carried;BUILD=kind=name;RULE=Name{feature=effect};GEAR=*NamexN{dmg,AC,pack=A+B}",
    `PC|${compactText(pc.name)}|L${Math.max(1, pc.level)}|${profile.creatureType}|${profile.size}`,
    `BUILD|${identityRules.join(";") || `${compactText(pc.race)};${compactText(pc.className)}`}`,
    `VITAL|HP=${pc.hp}/${calculated.maxHp};AC=${calculated.armorClass};PB=${formatMod(calculated.proficiencyBonus)};SPD=${calculated.speed};DC=${calculated.saveDc}`,
    `ABIL|${ABILITIES.map((ability) => {
      const score = effectiveAbilities[ability];
      return `${ability.toUpperCase()}=${score}/${formatMod(abilityMod(score))}`;
    }).join(";")}`,
    `SAVE|${ABILITIES.map(
      (ability) => `${ability.toUpperCase()}=${formatMod(calculated.savingThrows[ability] ?? 0)}`
    ).join(";")}`,
    `RP|alignment=${compactText(pc.alignment) || "-"};personality=${compactText(pc.personality) || "-"}`,
    `WALLET|${pc.wallet.gold}gp;${pc.wallet.silver}sp;${pc.wallet.copper}cp`,
  ];

  addLine(lines, "SKILL", calculated.skillBonuses);
  addLine(lines, "PROF", calculated.proficiencies);
  addLine(lines, "SENSE", calculated.senses);
  addLine(lines, "LANG", calculated.languages);
  addLine(lines, "DEF", [
    calculated.vulnerabilities.length
      ? `vuln=${calculated.vulnerabilities.join(",")}`
      : "",
    calculated.resistances.length ? `res=${calculated.resistances.join(",")}` : "",
    calculated.damageImmunities.length
      ? `dmgImm=${calculated.damageImmunities.join(",")}`
      : "",
    calculated.conditionImmunities.length
      ? `condImm=${calculated.conditionImmunities.join(",")}`
      : "",
  ]);
  addLine(
    lines,
    "TRAIT",
    pc.traits.map((entry) => `${entry.name}=${entry.description}`)
  );
  addLine(
    lines,
    "FEATURE",
    pc.features.map((entry) => `${entry.name}=${entry.description}`)
  );
  addLine(
    lines,
    "STATUS",
    pc.statuses.map((entry) => `${entry.kind}:${entry.name}${entry.note ? `=${entry.note}` : ""}`)
  );
  addLine(
    lines,
    "GEAR",
    pc.inventory.map((carried) => {
      const catalog = libraryItems.find((entry) => entry.id === carried.libraryItemId);
      const mechanics = catalog ? gearMechanics(catalog, libraryItems) : "";
      return `${carried.equipped ? "*" : "-"}${compactText(carried.name)}x${carried.qty}${mechanics ? `{${mechanics}}` : ""}${carried.notes ? `[${compactText(carried.notes)}]` : ""}`;
    })
  );
  addLine(
    lines,
    "RULE",
    activeRules.map((entry) => {
      const parts = [
        ...entry.features
          .filter((ruleFeature) => ruleFeature.level <= pc.level)
          .map(
            (ruleFeature) =>
              `${ruleFeature.name}${ruleFeature.effect ? `=${ruleFeature.effect}` : ""}`
          ),
        notesAreCovered(entry.notes, entry.features) ? "" : `note=${compactText(entry.notes)}`,
      ].filter(Boolean);
      return parts.length ? `${entry.name}{${parts.join(";")}}` : "";
    })
  );
  addLine(
    lines,
    "CHOICE",
    activeRules.flatMap((entry) =>
      (entry.choices ?? []).flatMap((choice) => {
        const values = pc.ruleChoices?.[`${entry.id}:${choice.id}`] ?? [];
        return values.length ? [`${entry.name}:${choice.label}=${values.join(",")}`] : [];
      })
    )
  );
  addLine(lines, "ACTION", calculated.specialActions);
  return lines.join("\n");
}

function systemPrompt(
  pc: PC,
  party: PC[],
  rules: RuleDefinition[],
  libraryItems: LibraryItem[],
  extraInstructions: string
): string {
  const others = party.filter((p) => p.id !== pc.id).map((p) => p.name);
  const extra = extraInstructions.trim();
  return [
    `You are roleplaying ${pc.name}, a player character in a tabletop RPG session run by a human Game Master.`,
    ``,
    `PERSONALITY: ${pc.personality}`,
    ``,
    `CHARACTER SHEET:`,
    compactCharacterContext(pc, rules, libraryItems),
    ``,
    others.length
      ? `The other party members are: ${others.join(", ")}. You are aware of them and of what they say and do (you will see it in the scene log), but you NEVER speak for them, act for them, or decide anything on their behalf. You only control ${pc.name}.`
      : `You are currently the only member of the party.`,
    extra ? `\nADDITIONAL GM INSTRUCTIONS:\n${extra}` : "",
    ``,
    `RULES:`,
    `- Stay fully in character as ${pc.name}.`,
    `- Respond with what ${pc.name} says and/or does. Keep it to 1-4 sentences.`,
    `- Never narrate outcomes, the world, dice results, or NPC reactions; that is the GM's job.`,
    `- Never write dialogue or actions for the GM or other party members.`,
    `- Use plain prose. Wrap physical actions in *asterisks*, e.g. *draws sword*.`,
  ].join("\n");
}

function sceneTranscript(log: LogEntry[], pc: PC, contextWindow: number): string {
  const recent = log.slice(-Math.max(1, contextWindow));
  if (recent.length === 0) return "(The session is just beginning.)";
  return recent
    .map((e) => {
      const who =
        e.role === "gm" ? "GM" : e.authorId === pc.id ? `${e.author} (you)` : e.author;
      return `${who}: ${e.text}`;
    })
    .join("\n");
}

export async function generatePCResponse(
  pc: PC,
  party: PC[],
  log: LogEntry[],
  settings: AISettings,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): Promise<string> {
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
    throw new Error("Choose a model in Settings.");
  }

  const system = systemPrompt(
    pc,
    party,
    rules,
    libraryItems,
    settings.extraInstructions
  );
  const user = `SCENE LOG:\n${sceneTranscript(log, pc, settings.contextWindow)}\n\nIt is ${pc.name}'s moment to react. What do you say or do?`;
  const text = await completeChat(settings, system, user);
  if (!text) throw new Error("AI returned an empty response.");
  return text.trim();
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
    max_tokens: settings.maxTokens,
  };
  if (!omitTemperature(settings.model, "azure")) {
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
