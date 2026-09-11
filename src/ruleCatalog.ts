import type { RuleDefinition, RuleKind } from "./types";
import { HANDBOOK_RULES } from "./handbookRuleCatalog";

const rule = (
  id: string,
  kind: RuleKind,
  name: string,
  patch: Partial<RuleDefinition> = {}
): RuleDefinition => ({
  id,
  kind,
  name,
  minLevel: 1,
  abilityScoreImprovementLevels: [],
  resourceTracks: [],
  spellcasting: null,
  abilityBonuses: {},
  saveBonuses: {},
  extraHp: 0,
  hpPerLevel: 0,
  armorBonus: 0,
  speed: 0,
  saveProficiencies: [],
  proficiencies: [],
  skillBonuses: [],
  senses: [],
  languages: [],
  vulnerabilities: [],
  resistances: [],
  damageImmunities: [],
  conditionImmunities: [],
  specialActions: [],
  features: [],
  hitDie: 0,
  sourcePage: 0,
  unarmoredAcAbilities: [],
  startingKit: [],
  choices: [],
  notes: "",
  ...patch,
});

export const PREMADE_RULES: RuleDefinition[] = HANDBOOK_RULES;

export function createBlankRule(kind: RuleKind): RuleDefinition {
  return rule(crypto.randomUUID(), kind, `New ${kind[0].toUpperCase()}${kind.slice(1)}`);
}
