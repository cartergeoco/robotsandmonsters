import {
  ABILITY_SHORT,
  STATUS_EFFECT_PRESETS,
  TOKEN_FLOATER_MS,
  calculateCreatureStats,
  creatureFeedbackFloater,
  tokenDisplayName,
  type AreaPresence,
  type LibraryItem,
  type LogEntry,
  type MapToken,
  type PC,
  type RuleDefinition,
  type SaveArea,
  type StatusEffect,
  type TokenFloater,
} from "./types";
import {
  bestSpotter,
  isHiding,
  occupiedWorldCells,
  passivePerception,
  unhideCreature,
} from "./perception";
import { applyHpChange, creatureUsesDeathSaves } from "./deathSaves";
import { rollDie } from "./util";

const uid = () => crypto.randomUUID();

interface PlacedCreature {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: PC["bounds"];
  hidden?: boolean;
  stealthTotal?: number | null;
  statuses?: StatusEffect[];
  hp: number;
  maxHp: number;
}

function dieSides(die: SaveArea["damageDie"]): number {
  return Number(die.slice(1)) || 6;
}

function creatureName(creature: PC | MapToken, isPC: boolean): string {
  return isPC ? (creature as PC).name : tokenDisplayName(creature as MapToken);
}

function occupiesArea(creature: PlacedCreature, area: SaveArea): boolean {
  const footprint = occupiedWorldCells(creature);
  return area.cells.some((cell) =>
    footprint.some((foot) => foot.x === cell.x && foot.y === cell.y)
  );
}

function withFailStatus(
  statuses: StatusEffect[] | undefined,
  failStatusId: SaveArea["failStatusId"]
): StatusEffect[] {
  if (!failStatusId) return statuses ?? [];
  const preset = STATUS_EFFECT_PRESETS.find((entry) => entry.id === failStatusId);
  if (!preset) return statuses ?? [];
  if ((statuses ?? []).some((status) => status.effectId === preset.id)) {
    return statuses ?? [];
  }
  return [
    ...(statuses ?? []),
    {
      id: uid(),
      effectId: preset.id,
      name: preset.name,
      kind: preset.kind,
      color: preset.color,
      note: "",
    },
  ];
}

function pruneFloaters(floaters: TokenFloater[], now: number): TokenFloater[] {
  return floaters.filter((floater) => now - floater.bornAt < TOKEN_FLOATER_MS);
}

export interface SceneTriggerResult {
  pcs: PC[];
  tokens: MapToken[];
  areaPresence: AreaPresence[];
  tokenFloaters: TokenFloater[];
  statusSheens: Array<{ creatureId: string; kind: "buff" | "debuff" }>;
  logs: Omit<LogEntry, "id" | "ts">[];
  changed: boolean;
}

export function resolveSceneTriggers(input: {
  pcs: PC[];
  tokens: MapToken[];
  saveAreas: SaveArea[];
  areaPresence: AreaPresence[];
  tokenFloaters: TokenFloater[];
  rules: RuleDefinition[];
  items: LibraryItem[];
  perceptionRadius: number;
  now?: number;
}): SceneTriggerResult {
  const now = input.now ?? Date.now();
  const logs: Omit<LogEntry, "id" | "ts">[] = [];
  const statusSheens: Array<{ creatureId: string; kind: "buff" | "debuff" }> = [];
  const floaters = pruneFloaters(input.tokenFloaters, now);
  const hasHiddenCreature =
    input.tokens.some((token) => isHiding(token)) ||
    input.pcs.some((pc) => isHiding(pc));
  if (!hasHiddenCreature && input.saveAreas.length === 0) {
    const changed =
      floaters.length !== input.tokenFloaters.length ||
      input.areaPresence.length > 0;
    return {
      pcs: input.pcs,
      tokens: input.tokens,
      areaPresence: changed ? [] : input.areaPresence,
      tokenFloaters: floaters,
      statusSheens,
      logs,
      changed,
    };
  }
  const pcs = input.pcs.map((pc) => ({ ...pc }));
  const tokens = input.tokens.map((token) => ({ ...token }));
  let changed = false;

  function addFloater(partial: Omit<TokenFloater, "id" | "bornAt">) {
    floaters.push({ ...partial, id: uid(), bornAt: now });
    changed = true;
  }

  for (const token of tokens) {
    if (!isHiding(token)) continue;
    const spotter = bestSpotter(
      pcs,
      token,
      input.rules,
      input.items,
      input.perceptionRadius
    );
    if (!spotter) continue;
    const priorStealth = token.stealthTotal;
    Object.assign(token, unhideCreature(token));
    const pp = passivePerception(spotter, input.rules, input.items);
    const stealthLabel = typeof priorStealth === "number" ? String(priorStealth) : "?";
    logs.push({
      role: "system",
      author: "Check",
      text: `${spotter.name} spots ${tokenDisplayName(token)} (passive Perception ${pp} vs Stealth ${stealthLabel}).`,
    });
    addFloater({
      creatureId: token.id,
      title: "SPOTTED",
      detail: `PP ${pp} vs ${stealthLabel}`,
      outcome: "info",
    });
  }

  for (const pc of pcs) {
    if (!isHiding(pc)) continue;
    const spotter = bestSpotter(
      pcs.filter((member) => member.id !== pc.id),
      pc,
      input.rules,
      input.items,
      input.perceptionRadius
    );
    if (!spotter) continue;
    const priorStealth = pc.stealthTotal;
    Object.assign(pc, unhideCreature(pc));
    const pp = passivePerception(spotter, input.rules, input.items);
    const stealthLabel = typeof priorStealth === "number" ? String(priorStealth) : "?";
    logs.push({
      role: "system",
      author: "Check",
      text: `${spotter.name} spots ${pc.name} (passive Perception ${pp} vs Stealth ${stealthLabel}).`,
    });
    addFloater({
      creatureId: pc.id,
      title: "SPOTTED",
      detail: `PP ${pp} vs ${stealthLabel}`,
      outcome: "info",
    });
  }

  const creatures: { creature: PC | MapToken; isPC: boolean }[] = [
    ...pcs.map((creature) => ({ creature, isPC: true })),
    ...tokens
      .filter((token) => token.kind !== "object")
      .map((creature) => ({ creature, isPC: false })),
  ];

  const nextPresence: AreaPresence[] = [];
  const previous = new Set(
    input.areaPresence.map((entry) => `${entry.creatureId}:${entry.areaId}`)
  );

  for (const { creature, isPC } of creatures) {
    for (const area of input.saveAreas) {
      if (!occupiesArea(creature, area)) continue;
      const key = `${creature.id}:${area.id}`;
      nextPresence.push({ creatureId: creature.id, areaId: area.id });
      if (previous.has(key)) continue;

      const stats = calculateCreatureStats(creature, input.rules, input.items);
      const bonus = stats.savingThrows[area.saveAbility] ?? 0;
      const d20 = rollDie(20);
      const total = d20 + bonus;
      const success = total >= area.dc;
      const natural = d20 === 20 ? "natural 20" : d20 === 1 ? "natural 1" : "";
      let damage = 0;
      if (area.damageDiceCount > 0) {
        const sides = dieSides(area.damageDie);
        for (let i = 0; i < area.damageDiceCount; i++) damage += rollDie(sides);
        if (success && area.halfOnSuccess) damage = Math.floor(damage / 2);
        else if (success) damage = 0;
      }
      if (!success && area.failStatusId) {
        const priorStatuses = creature.statuses;
        creature.statuses = withFailStatus(creature.statuses, area.failStatusId);
        if (creature.statuses !== priorStatuses) {
          const added = creature.statuses[creature.statuses.length - 1];
          if (added?.kind === "buff" || added?.kind === "debuff") {
            statusSheens.push({ creatureId: creature.id, kind: added.kind });
            addFloater(
              creatureFeedbackFloater(
                creature.id,
                added.kind,
                added.name.toUpperCase()
              )
            );
          }
        }
      }
      let deathBit = "";
      if (damage > 0) {
        const result = applyHpChange(creature, -damage, {
          usesDeathSaves: creatureUsesDeathSaves(creature),
        });
        Object.assign(creature, result.creature);
        if (result.log) deathBit = ` — ${result.log}`;
      }

      const ability = ABILITY_SHORT[area.saveAbility];
      const name = creatureName(creature, isPC);
      const bonusLabel = bonus >= 0 ? `+${bonus}` : String(bonus);
      const outcome = success ? "Success" : "Failed";
      const damageBit =
        area.damageDiceCount > 0
          ? success && !area.halfOnSuccess
            ? " — no damage"
            : ` — ${damage} ${area.damageType || "damage"}`.trimEnd()
          : "";
      const statusBit =
        !success && area.failStatusId
          ? ` — ${STATUS_EFFECT_PRESETS.find((entry) => entry.id === area.failStatusId)?.name ?? "afflicted"}`
          : "";
      const naturalBit = natural ? ` (${natural})` : "";
      logs.push({
        role: "system",
        author: "Save",
        color: creature.color,
        authorId: isPC ? creature.id : undefined,
        text: `${name} — ${ability} save ${d20} ${bonusLabel} = ${total} vs DC ${area.dc} (${area.name}): ${outcome}${naturalBit}${damageBit}${statusBit}${deathBit}.`,
      });
      addFloater({
        creatureId: creature.id,
        title: `${ability} SAVE`,
        detail: `${total} vs ${area.dc} · ${outcome.toUpperCase()}`,
        outcome: success ? "success" : "fail",
      });
    }
  }

  const presenceChanged =
    nextPresence.length !== input.areaPresence.length ||
    nextPresence.some(
      (entry) => !previous.has(`${entry.creatureId}:${entry.areaId}`)
    ) ||
    input.areaPresence.some(
      (entry) =>
        !nextPresence.some(
          (next) => next.creatureId === entry.creatureId && next.areaId === entry.areaId
        )
    );
  if (presenceChanged) changed = true;

  const pcsMutated = pcs.some((pc, index) => {
    const prior = input.pcs[index];
    return (
      pc.hidden !== prior.hidden ||
      pc.stealthTotal !== prior.stealthTotal ||
      pc.hp !== prior.hp ||
      pc.statuses !== prior.statuses ||
      pc.deathSaves !== prior.deathSaves
    );
  });
  const tokensMutated = tokens.some((token, index) => {
    const prior = input.tokens[index];
    return (
      token.hidden !== prior.hidden ||
      token.stealthTotal !== prior.stealthTotal ||
      token.hp !== prior.hp ||
      token.statuses !== prior.statuses ||
      token.deathSaves !== prior.deathSaves
    );
  });

  if (logs.length || pcsMutated || tokensMutated || presenceChanged) changed = true;

  return {
    pcs,
    tokens,
    areaPresence: nextPresence,
    tokenFloaters: floaters,
    statusSheens,
    logs,
    changed,
  };
}
