import type { AISettings, LogEntry, PC } from "./types";
import { abilityMod, formatMod } from "./types";

/** How many recent log entries each PC sees as scene context. */
const CONTEXT_WINDOW = 40;

function characterSheet(pc: PC): string {
  const a = pc.abilities;
  const lines = [
    `Name: ${pc.name}`,
    `Race/Class: ${pc.race} ${pc.className}, level ${pc.level}`,
    `HP: ${pc.hp}/${pc.maxHp}  AC: ${pc.ac}`,
    `Abilities: STR ${a.str} (${formatMod(abilityMod(a.str))}), DEX ${a.dex} (${formatMod(abilityMod(a.dex))}), CON ${a.con} (${formatMod(abilityMod(a.con))}), INT ${a.int} (${formatMod(abilityMod(a.int))}), WIS ${a.wis} (${formatMod(abilityMod(a.wis))}), CHA ${a.cha} (${formatMod(abilityMod(a.cha))})`,
  ];
  if (pc.skills.length)
    lines.push(`Skills: ${pc.skills.map((s) => `${s.name} ${formatMod(s.bonus)}`).join(", ")}`);
  if (pc.traits.length)
    lines.push(`Traits: ${pc.traits.map((t) => `${t.name} (${t.description})`).join("; ")}`);
  if (pc.features.length)
    lines.push(`Features: ${pc.features.map((t) => `${t.name} (${t.description})`).join("; ")}`);
  if (pc.inventory.length)
    lines.push(`Inventory: ${pc.inventory.map((i) => `${i.name} x${i.qty}`).join(", ")}`);
  if (pc.statuses.length)
    lines.push(
      `Active effects: ${pc.statuses.map((s) => `${s.name} (${s.kind})`).join(", ")}`
    );
  return lines.join("\n");
}

function systemPrompt(pc: PC, party: PC[]): string {
  const others = party.filter((p) => p.id !== pc.id).map((p) => p.name);
  return [
    `You are roleplaying ${pc.name}, a player character in a tabletop RPG session run by a human Game Master.`,
    ``,
    `PERSONALITY: ${pc.personality}`,
    ``,
    `CHARACTER SHEET:`,
    characterSheet(pc),
    ``,
    others.length
      ? `The other party members are: ${others.join(", ")}. You are aware of them and of what they say and do (you will see it in the scene log), but you NEVER speak for them, act for them, or decide anything on their behalf. You only control ${pc.name}.`
      : `You are currently the only member of the party.`,
    ``,
    `RULES:`,
    `- Stay fully in character as ${pc.name}.`,
    `- Respond with what ${pc.name} says and/or does. Keep it to 1-4 sentences.`,
    `- Never narrate outcomes, the world, dice results, or NPC reactions; that is the GM's job.`,
    `- Never write dialogue or actions for the GM or other party members.`,
    `- Use plain prose. Wrap physical actions in *asterisks*, e.g. *draws sword*.`,
  ].join("\n");
}

function sceneTranscript(log: LogEntry[], pc: PC): string {
  const recent = log.slice(-CONTEXT_WINDOW);
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
  settings: AISettings
): Promise<string> {
  if (!settings.apiKey.trim()) {
    throw new Error(
      "No API key set. Open Settings (gear icon, top right) and add one."
    );
  }

  const res = await fetch(`${settings.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.9,
      max_tokens: 220,
      messages: [
        { role: "system", content: systemPrompt(pc, party) },
        {
          role: "user",
          content: `SCENE LOG:\n${sceneTranscript(log, pc)}\n\nIt is ${pc.name}'s moment to react. What do you say or do?`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}): ${body.slice(0, 300)}`);
  }

  const data = await res.json();
  const text: string | undefined = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("AI returned an empty response.");
  return text.trim();
}
