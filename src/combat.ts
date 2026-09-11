import {
  FEET_PER_CELL,
  calculateCreatureStats,
  type AbilityKey,
  type ActionSlot,
  type Combatant,
  type CombatState,
  type CreatureMechanics,
  type LibraryItem,
  type RuleDefinition,
} from "./types";
import { creatureCanRollChecks } from "./checks";
import { isDead } from "./deathSaves";

/**
 * Asks the map to pan to a creature. Kept as an event so the camera math
 * stays inside MapCanvas, which owns the viewport dimensions.
 */
export const FOCUS_CREATURE_EVENT = "ram:focus-creature";

export function focusCreature(id: string): void {
  window.dispatchEvent(
    new CustomEvent(FOCUS_CREATURE_EVENT, { detail: { id } })
  );
}

/** The order a turn's economy is displayed and spent in. */
export const ACTION_SLOTS: ActionSlot[] = ["action", "bonusAction", "reaction"];

export const ACTION_SLOT_LABELS: Record<ActionSlot, string> = {
  action: "Action",
  bonusAction: "Bonus",
  reaction: "Reaction",
};

export function canJoinCombat(creature: CreatureMechanics): boolean {
  return creatureCanRollChecks(creature);
}

export function initiativeModifier(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  items: LibraryItem[]
): number {
  return calculateCreatureStats(creature, rules, items).abilityModifiers.dex;
}

export function combatantSpeed(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  items: LibraryItem[]
): number {
  return Math.max(0, calculateCreatureStats(creature, rules, items).speed);
}

export function createCombatant(input: {
  id: string;
  isPC: boolean;
  d20: number;
  dexMod: number;
}): Combatant {
  return {
    id: input.id,
    isPC: input.isPC,
    initiative: input.d20 + input.dexMod,
    d20: input.d20,
    dexMod: input.dexMod,
    tiebreak: Math.random(),
    movementUsed: 0,
    dashes: 0,
    action: false,
    bonusAction: false,
    reaction: false,
  };
}

/** Highest initiative first, then higher DEX, then the stored random tiebreak. */
export function sortCombatants(combatants: Combatant[]): Combatant[] {
  return [...combatants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    if (b.dexMod !== a.dexMod) return b.dexMod - a.dexMod;
    return a.tiebreak - b.tiebreak;
  });
}

export function activeCombatant(combat: CombatState | null): Combatant | null {
  if (!combat || !combat.combatants.length) return null;
  return combat.combatants[combat.turnIndex] ?? null;
}

export function combatantById(
  combat: CombatState | null,
  id: string
): Combatant | null {
  if (!combat) return null;
  return combat.combatants.find((entry) => entry.id === id) ?? null;
}

export function isInCombat(combat: CombatState | null, id: string): boolean {
  return combatantById(combat, id) !== null;
}

export function isActiveTurn(combat: CombatState | null, id: string): boolean {
  return activeCombatant(combat)?.id === id;
}

export interface MovementBudget {
  used: number;
  total: number;
  remaining: number;
  over: number;
  /** Whole cells still reachable, for the map range highlight. */
  cells: number;
}

export function movementBudget(
  combatant: Combatant,
  speed: number
): MovementBudget {
  const total = speed * (1 + Math.max(0, combatant.dashes));
  const used = Math.max(0, combatant.movementUsed);
  const remaining = Math.max(0, total - used);
  return {
    used,
    total,
    remaining,
    over: Math.max(0, used - total),
    cells: Math.floor(remaining / FEET_PER_CELL),
  };
}

export function resetTurnBudget(combatant: Combatant): Combatant {
  return {
    ...combatant,
    movementUsed: 0,
    dashes: 0,
    action: false,
    bonusAction: false,
    reaction: false,
  };
}

export interface TurnAdvance {
  combat: CombatState;
  /** True when the order wrapped around and the round counter incremented. */
  wrapped: boolean;
}

/**
 * Advances to the next combatant that is still standing, refreshing the
 * outgoing combatant's budget. Falls back to the raw next index when every
 * remaining combatant is dead, so combat never deadlocks.
 */
export function advanceTurn(
  combat: CombatState,
  step: 1 | -1,
  isDeadById: (combatant: Combatant) => boolean
): TurnAdvance {
  const count = combat.combatants.length;
  if (!count) return { combat, wrapped: false };

  const outgoing = combat.combatants[combat.turnIndex];
  const combatants = outgoing
    ? combat.combatants.map((entry) =>
        entry.id === outgoing.id ? resetTurnBudget(entry) : entry
      )
    : combat.combatants;

  let index = combat.turnIndex;
  let wrapped = false;
  for (let attempt = 0; attempt < count; attempt += 1) {
    const next = index + step;
    if (next >= count) {
      index = 0;
      wrapped = true;
    } else if (next < 0) {
      index = count - 1;
      wrapped = true;
    } else {
      index = next;
    }
    if (!isDeadById(combatants[index])) break;
  }

  return {
    combat: {
      ...combat,
      combatants,
      turnIndex: index,
      round: Math.max(1, combat.round + (wrapped && step === 1 ? 1 : 0)),
    },
    wrapped,
  };
}

/** Drops a combatant and keeps `turnIndex` pointing at the same creature. */
export function removeFromOrder(
  combat: CombatState,
  id: string
): CombatState | null {
  const index = combat.combatants.findIndex((entry) => entry.id === id);
  if (index < 0) return combat;
  const combatants = combat.combatants.filter((entry) => entry.id !== id);
  if (!combatants.length) return null;
  const turnIndex =
    index < combat.turnIndex
      ? combat.turnIndex - 1
      : Math.min(combat.turnIndex, combatants.length - 1);
  return { ...combat, combatants, turnIndex };
}

/** Inserts a late arrival in initiative order without disturbing whose turn it is. */
export function insertInOrder(
  combat: CombatState,
  combatant: Combatant
): CombatState {
  if (combat.combatants.some((entry) => entry.id === combatant.id)) return combat;
  const activeId = combat.combatants[combat.turnIndex]?.id;
  const combatants = sortCombatants([...combat.combatants, combatant]);
  const turnIndex = activeId
    ? Math.max(0, combatants.findIndex((entry) => entry.id === activeId))
    : combat.turnIndex;
  return { ...combat, combatants, turnIndex };
}

/** Guards a rehydrated fight against partial or hand-edited snapshots. */
export function normalizeCombat(
  value: Partial<CombatState> | null | undefined
): CombatState | null {
  if (!value || !Array.isArray(value.combatants) || !value.combatants.length) {
    return null;
  }
  const combatants = value.combatants
    .filter((entry): entry is Combatant => Boolean(entry?.id))
    .map((entry) => ({
      id: entry.id,
      isPC: Boolean(entry.isPC),
      initiative: Math.round(entry.initiative ?? 0),
      d20: Math.round(entry.d20 ?? 0),
      dexMod: Math.round(entry.dexMod ?? 0),
      tiebreak: typeof entry.tiebreak === "number" ? entry.tiebreak : Math.random(),
      movementUsed: Math.max(0, entry.movementUsed ?? 0),
      dashes: Math.max(0, Math.round(entry.dashes ?? 0)),
      action: Boolean(entry.action),
      bonusAction: Boolean(entry.bonusAction),
      reaction: Boolean(entry.reaction),
    }));
  if (!combatants.length) return null;
  return {
    round: Math.max(1, Math.round(value.round ?? 1)),
    turnIndex: Math.min(
      Math.max(0, Math.round(value.turnIndex ?? 0)),
      combatants.length - 1
    ),
    combatants,
    startedAt: value.startedAt ?? Date.now(),
  };
}

export function combatantIsDead(
  combatant: Combatant,
  lookup: (id: string, isPC: boolean) => CreatureMechanics | undefined
): boolean {
  const creature = lookup(combatant.id, combatant.isPC);
  if (!creature) return true;
  return isDead(creature);
}

export interface WeaponAttack {
  id: string;
  name: string;
  range: "melee" | "ranged";
  ability: AbilityKey;
  proficient: boolean;
  toHit: number;
  /** Dice notation without the ability modifier, e.g. "1d8". */
  damageDice: string;
  damageBonus: number;
  damageType: string;
  /** Larger dice when the weapon is wielded two-handed, e.g. "1d10". */
  versatileDice: string | null;
  properties: string[];
  notes: string[];
}

function isEquippedItem(item: { equipped?: boolean; equippedSlot?: string }): boolean {
  return Boolean(item.equippedSlot || item.equipped);
}

function hasProperty(weapon: LibraryItem, name: string): string | null {
  const match = weapon.properties.find((entry) =>
    entry.toLowerCase().startsWith(name)
  );
  return match ?? null;
}

/**
 * Simple and martial proficiency are granted by class as "Simple weapons" /
 * "Martial weapons"; a few classes instead name individual weapons.
 */
function weaponProficient(weapon: LibraryItem, proficiencies: string[]): boolean {
  const granted = proficiencies.map((entry) => entry.toLowerCase());
  if (granted.includes(weapon.name.toLowerCase())) return true;
  if (weapon.weaponClass && granted.includes(`${weapon.weaponClass} weapons`)) {
    return true;
  }
  return granted.includes("all weapons");
}

/**
 * The attack line for each equipped weapon. Nothing in the creature model
 * stores a to-hit bonus, so it is derived the same way the handbook does:
 * the governing ability modifier plus proficiency when the weapon is one the
 * creature trained with.
 */
export function weaponAttacks(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  items: LibraryItem[]
): WeaponAttack[] {
  if (!creatureCanRollChecks(creature)) return [];
  const stats = calculateCreatureStats(creature, rules, items);
  const mod = (ability: AbilityKey) => stats.abilityModifiers[ability];
  const equipped = creature.inventory
    .filter((item) => isEquippedItem(item) && item.libraryItemId)
    .map((item) => items.find((entry) => entry.id === item.libraryItemId))
    .filter((item): item is LibraryItem => item?.category === "weapon");

  if (!equipped.length) {
    const strength = mod("str");
    return [
      {
        id: "unarmed",
        name: "Unarmed Strike",
        range: "melee",
        ability: "str",
        proficient: true,
        toHit: strength + stats.proficiencyBonus,
        damageDice: "",
        damageBonus: Math.max(0, 1 + strength),
        damageType: "bludgeoning",
        versatileDice: null,
        properties: [],
        notes: [],
      },
    ];
  }

  return equipped.map((weapon) => {
    const ranged = weapon.weaponRange === "ranged";
    const finesse = Boolean(hasProperty(weapon, "finesse"));
    const ability: AbilityKey = finesse
      ? mod("dex") >= mod("str")
        ? "dex"
        : "str"
      : ranged
        ? "dex"
        : "str";
    const proficient = weaponProficient(weapon, stats.proficiencies);
    const versatile = hasProperty(weapon, "versatile");
    return {
      id: weapon.id,
      name: weapon.name,
      range: ranged ? "ranged" : "melee",
      ability,
      proficient,
      toHit: mod(ability) + (proficient ? stats.proficiencyBonus : 0),
      damageDice:
        weapon.damage || `${Math.max(1, weapon.damageDiceCount)}${weapon.damageDie}`,
      damageBonus: mod(ability),
      damageType: weapon.damageType,
      versatileDice: versatile?.split(/\s+/)[1] ?? null,
      properties: weapon.properties,
      notes: weapon.actions ?? [],
    };
  });
}

/** Rolls the dice half of an attack's damage, e.g. "2d6" -> 2..12. */
export function rollDamageDice(notation: string, roll: (sides: number) => number): number {
  const match = notation.match(/^(\d+)d(\d+)$/i);
  if (!match) return 0;
  const count = Math.max(0, Math.min(40, Number(match[1])));
  const sides = Math.max(2, Number(match[2]));
  let total = 0;
  for (let i = 0; i < count; i++) total += roll(sides);
  return total;
}
