import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  ABILITY_SHORT,
  SKILL_ABILITIES,
  SKILL_TAGS,
  calculateCreatureStats,
  formatMod,
  type AbilityKey,
  type CreatureMechanics,
  type LibraryItem,
  type RuleDefinition,
} from "./types";

export type SkillTag = (typeof SKILL_TAGS)[number];

export type CheckId =
  | `skill:${SkillTag}`
  | `ability:${AbilityKey}`
  | `save:${AbilityKey}`;

export interface CheckOption {
  id: CheckId;
  group: "Skills" | "Ability checks" | "Saving throws";
  label: string;
  shortLabel: string;
  modifier: number;
}

export function creatureCanRollChecks(creature: CreatureMechanics): boolean {
  if ("kind" in creature && creature.kind === "object") return false;
  if (creature.creatureType === "object") return false;
  return true;
}

export function checkOptionsFor(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  items: LibraryItem[]
): CheckOption[] {
  const stats = calculateCreatureStats(creature, rules, items);
  const skills: CheckOption[] = SKILL_TAGS.map((skill) => {
    const ability = SKILL_ABILITIES[skill];
    const modifier = stats.skillModifiers[skill] ?? 0;
    return {
      id: `skill:${skill}`,
      group: "Skills",
      label: `${skill} (${ABILITY_SHORT[ability]} ${formatMod(modifier)})`,
      shortLabel: skill,
      modifier,
    };
  });
  const abilities: CheckOption[] = ABILITY_KEYS.map((ability) => {
    const modifier = stats.abilityCheckModifiers[ability];
    return {
      id: `ability:${ability}`,
      group: "Ability checks",
      label: `${ABILITY_LABELS[ability]} check (${formatMod(modifier)})`,
      shortLabel: `${ABILITY_SHORT[ability]} check`,
      modifier,
    };
  });
  const saves: CheckOption[] = ABILITY_KEYS.map((ability) => {
    const modifier = stats.savingThrows[ability] ?? 0;
    return {
      id: `save:${ability}`,
      group: "Saving throws",
      label: `${ABILITY_LABELS[ability]} save (${formatMod(modifier)})`,
      shortLabel: `${ABILITY_SHORT[ability]} save`,
      modifier,
    };
  });
  return [...skills, ...abilities, ...saves];
}

export function findCheckOption(
  options: CheckOption[],
  id: string
): CheckOption | undefined {
  return options.find((option) => option.id === id);
}

export const DEFAULT_CHECK_ID: CheckId = "skill:Perception";
