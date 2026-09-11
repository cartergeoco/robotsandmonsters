import {
  FEET_PER_CELL,
  STATUS_EFFECT_PRESETS,
  calculateCreatureStats,
  rectangularTokenBounds,
  type CreatureMechanics,
  type LibraryItem,
  type PC,
  type RuleDefinition,
  type StatusEffect,
  type TokenCell,
} from "./types";
import { rollDie } from "./util";

interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: TokenCell[];
}

export function occupiedWorldCells(entity: Placed): TokenCell[] {
  const bounds = entity.bounds?.length
    ? entity.bounds
    : rectangularTokenBounds(entity.width, entity.height);
  return bounds.map((cell) => ({ x: entity.x + cell.x, y: entity.y + cell.y }));
}

export function distanceFeet(a: Placed, b: Placed): number {
  let best = Number.POSITIVE_INFINITY;
  for (const cellA of occupiedWorldCells(a)) {
    for (const cellB of occupiedWorldCells(b)) {
      best = Math.min(
        best,
        Math.max(Math.abs(cellA.x - cellB.x), Math.abs(cellA.y - cellB.y))
      );
    }
  }
  return best * FEET_PER_CELL;
}

function hasStatus(
  creature: { statuses?: StatusEffect[] },
  id: string
): boolean {
  return (creature.statuses ?? []).some(
    (status) =>
      status.effectId === id || status.name.toLowerCase() === id.toLowerCase()
  );
}

export function isInvisible(creature: { statuses?: StatusEffect[] }): boolean {
  return hasStatus(creature, "invisible");
}

export function isHiding(creature: {
  hidden?: boolean;
  statuses?: StatusEffect[];
}): boolean {
  return Boolean(creature.hidden) || hasStatus(creature, "hidden");
}

export function isConcealed(creature: {
  hidden?: boolean;
  statuses?: StatusEffect[];
}): boolean {
  return isInvisible(creature) || isHiding(creature);
}

function hasSense(
  senses: string[],
  needle: string
): boolean {
  return senses.some((sense) => sense.toLowerCase().includes(needle.toLowerCase()));
}

export function passivePerception(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): number {
  return calculateCreatureStats(creature, rules, libraryItems).passivePerception;
}

export function rollStealthCheck(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): number {
  const stats = calculateCreatureStats(creature, rules, libraryItems);
  const bonus = stats.skillModifiers.Stealth ?? 0;
  const first = rollDie(20);
  if (!stats.stealthDisadvantage) return first + bonus;
  return Math.min(first, rollDie(20)) + bonus;
}

function withoutStatus(
  statuses: StatusEffect[] | undefined,
  id: string
): StatusEffect[] {
  return (statuses ?? []).filter(
    (status) =>
      status.effectId !== id && status.name.toLowerCase() !== id.toLowerCase()
  );
}

function withStatus(
  statuses: StatusEffect[] | undefined,
  id: "hidden" | "invisible"
): StatusEffect[] {
  if (hasStatus({ statuses: statuses ?? [] }, id)) return statuses ?? [];
  const preset = STATUS_EFFECT_PRESETS.find((entry) => entry.id === id);
  if (!preset) return statuses ?? [];
  return [
    ...(statuses ?? []),
    {
      id: crypto.randomUUID(),
      effectId: preset.id,
      name: preset.name,
      kind: preset.kind,
      color: preset.color,
      note: "",
    },
  ];
}

export function concealCreature<T extends CreatureMechanics & { hidden?: boolean; stealthTotal?: number | null }>(
  creature: T,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[],
  mode: "hidden" | "invisible"
): Pick<T, "hidden" | "stealthTotal" | "statuses"> {
  const already = typeof creature.stealthTotal === "number" ? creature.stealthTotal : null;
  return {
    hidden: mode === "hidden" ? true : Boolean(creature.hidden),
    stealthTotal: already ?? rollStealthCheck(creature, rules, libraryItems),
    statuses: withStatus(creature.statuses, mode),
  };
}

export function revealCreature<T extends CreatureMechanics>(
  creature: T
): { hidden: false; stealthTotal: null; statuses: StatusEffect[] } {
  return {
    hidden: false,
    stealthTotal: null,
    statuses: withoutStatus(
      withoutStatus(creature.statuses, "hidden"),
      "invisible"
    ),
  };
}

/** Hide ends when spotted. Invisibility stays until a sense or effect removes it. */
export function unhideCreature<T extends CreatureMechanics & { hidden?: boolean; stealthTotal?: number | null }>(
  creature: T
): Pick<T, "hidden" | "stealthTotal" | "statuses"> {
  return {
    hidden: false,
    stealthTotal: isInvisible(creature) ? creature.stealthTotal ?? null : null,
    statuses: withoutStatus(creature.statuses, "hidden"),
  };
}

export function observerCanPerceive(
  observer: CreatureMechanics & Placed,
  target: CreatureMechanics & Placed & { stealthTotal?: number | null; hidden?: boolean },
  rules: RuleDefinition[],
  libraryItems: LibraryItem[],
  perceptionRadius: number
): boolean {
  if (!isConcealed(target)) return true;
  const feet = distanceFeet(observer, target);
  if (!Number.isFinite(feet) || feet > perceptionRadius) return false;

  const observerStats = calculateCreatureStats(observer, rules, libraryItems);
  if (hasStatus(observer, "blinded") && !hasSense(observerStats.senses, "blindsight")) {
    return false;
  }
  if (isInvisible(target) && hasSense(observerStats.senses, "truesight")) {
    return true;
  }

  const stealthTotal =
    typeof target.stealthTotal === "number" ? target.stealthTotal : null;
  if (stealthTotal == null) return false;
  return observerStats.passivePerception >= stealthTotal;
}

export function partyCanPerceive(
  party: PC[],
  target: CreatureMechanics & Placed & { stealthTotal?: number | null; hidden?: boolean },
  rules: RuleDefinition[],
  libraryItems: LibraryItem[],
  perceptionRadius: number
): boolean {
  if (!isConcealed(target)) return true;
  return Boolean(bestSpotter(party, target, rules, libraryItems, perceptionRadius));
}

export function bestSpotter(
  party: PC[],
  target: CreatureMechanics & Placed & { stealthTotal?: number | null; hidden?: boolean },
  rules: RuleDefinition[],
  libraryItems: LibraryItem[],
  perceptionRadius: number
): PC | null {
  if (!isConcealed(target)) return null;
  const capable = party.filter((pc) =>
    observerCanPerceive(pc, target, rules, libraryItems, perceptionRadius)
  );
  if (!capable.length) return null;
  return [...capable].sort((a, b) => {
    const distance = distanceFeet(a, target) - distanceFeet(b, target);
    if (distance !== 0) return distance;
    return (
      passivePerception(b, rules, libraryItems) -
      passivePerception(a, rules, libraryItems)
    );
  })[0];
}
