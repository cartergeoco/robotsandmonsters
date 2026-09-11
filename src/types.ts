export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export const ABILITY_KEYS = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type AbilityKey = (typeof ABILITY_KEYS)[number];

export const ABILITY_LABELS: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

export const ABILITY_SHORT: Record<AbilityKey, string> = {
  str: "STR",
  dex: "DEX",
  con: "CON",
  int: "INT",
  wis: "WIS",
  cha: "CHA",
};

export interface Item {
  id: string;
  libraryItemId?: string;
  name: string;
  qty: number;
  notes: string;
  equipped?: boolean;
  equippedSlot?: EquipmentSlot;
}

export const ITEM_CATEGORIES = [
  "weapon",
  "tool",
  "armor",
  "gear",
  "consumable",
  "material",
  "quest",
  "junk",
  "misc",
] as const;

export type ItemCategory = (typeof ITEM_CATEGORIES)[number];

export const ITEM_RARITIES = [
  "common",
  "uncommon",
  "rare",
  "very-rare",
  "legendary",
  "artifact",
] as const;

export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const ITEM_RARITY_LABELS: Record<ItemRarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  "very-rare": "Very Rare",
  legendary: "Legendary",
  artifact: "Artifact",
};

/** Solid name colors for native selects; catalog names use CSS for Artifact. */
export const ITEM_RARITY_COLORS: Record<ItemRarity, string> = {
  common: "",
  uncommon: "#5dce7a",
  rare: "#5b9cff",
  "very-rare": "#b57cff",
  legendary: "#e0a24a",
  artifact: "#d85a8c",
};

export function isItemRarity(value: unknown): value is ItemRarity {
  return typeof value === "string" && (ITEM_RARITIES as readonly string[]).includes(value);
}

export function normalizeItemRarity(value: unknown): ItemRarity {
  return isItemRarity(value) ? value : "common";
}

export const EQUIPMENT_SLOTS = [
  "armor",
  "mainHand",
  "offHand",
  "gear1",
  "gear2",
  "gear3",
] as const;
export type EquipmentSlot = (typeof EQUIPMENT_SLOTS)[number];

export const DAMAGE_DICE = ["d4", "d6", "d8", "d10", "d12", "d20"] as const;
export type DamageDie = (typeof DAMAGE_DICE)[number];

export const DAMAGE_TYPES = [
  "acid",
  "bludgeoning",
  "cold",
  "fire",
  "force",
  "lightning",
  "necrotic",
  "piercing",
  "poison",
  "psychic",
  "radiant",
  "slashing",
  "thunder",
] as const;

export const WEAPON_PROPERTIES = [
  "Ammunition",
  "Finesse",
  "Heavy",
  "Light",
  "Loading",
  "Reach",
  "Silvered",
  "Special",
  "Thrown",
  "Two-handed",
  "Versatile",
] as const;

export const CONTAINER_TYPES = [
  "",
  "barrel",
  "bottle",
  "bucket",
  "flask",
  "jug",
  "vial",
  "waterskin",
] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number];

export interface LibraryItem {
  id: string;
  category: ItemCategory;
  name: string;
  /** Visual-only label for the GM; defaults to Common on older saves. */
  rarity: ItemRarity;
  description: string;
  value: number;
  weight: number;
  equipSlot: "none" | "weapon" | "armor" | "shield" | "gear";
  armorClass: number;
  armorBonus: number;
  hpBonus: number;
  /** Handbook-compatible price normalized to copper pieces. */
  costCp: number;
  sourcePage: number;
  damage: string;
  damageDiceCount: number;
  damageDie: DamageDie;
  damageType: string;
  weaponClass: "" | "simple" | "martial";
  weaponRange: "" | "melee" | "ranged";
  properties: string[];
  armorDexterity: "none" | "full" | "max2";
  strengthRequirement: number;
  stealthDisadvantage: boolean;
  containerType: ContainerType;
  contents: string;
  capacity: string;
  actions: string[];
  /** Nested library item ids, used by packs. Optional `:qty` suffix, e.g. `item-torch:10`. */
  contains: string[];
  image?: string;
}

export function parseContainedItem(entry: string): { libraryItemId: string; qty: number } {
  const [libraryItemId, rawQty] = entry.split(":");
  return {
    libraryItemId: (libraryItemId ?? "").trim(),
    qty: Math.max(1, Number(rawQty) || 1),
  };
}

export interface StartingKitItem {
  libraryItemId: string;
  qty: number;
  equipped?: boolean;
}

/**
 * The fourteen Monster Manual creature types, plus two app-only categories.
 * A creature's type is pure categorization and carries no rules of its own,
 * so a monster is fully described by its type and stat block — it needs no
 * race, class, or level the way a player character does.
 */
export const CREATURE_TYPES = [
  "aberration",
  "beast",
  "celestial",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "humanoid",
  "monstrosity",
  "ooze",
  "plant",
  "undead",
  /** Not a creature type: doors, chests, and other inanimate map tokens. */
  "object",
  "other",
] as const;

export type CreatureType = (typeof CREATURE_TYPES)[number];

export const CREATURE_SIZES = [
  "tiny",
  "small",
  "medium",
  "large",
  "huge",
  "gargantuan",
] as const;

export type CreatureSize = (typeof CREATURE_SIZES)[number];

/** Hit die and grid footprint per size category (Monster Manual, "Statistics"). */
export const SIZE_PROFILES: Record<
  CreatureSize,
  { hitDie: number; averagePerDie: number; cells: number }
> = {
  tiny: { hitDie: 4, averagePerDie: 2.5, cells: 1 },
  small: { hitDie: 6, averagePerDie: 3.5, cells: 1 },
  medium: { hitDie: 8, averagePerDie: 4.5, cells: 1 },
  large: { hitDie: 10, averagePerDie: 5.5, cells: 2 },
  huge: { hitDie: 12, averagePerDie: 6.5, cells: 3 },
  gargantuan: { hitDie: 20, averagePerDie: 10.5, cells: 4 },
};

export const CHALLENGE_RATINGS = [
  "0", "1/8", "1/4", "1/2",
  "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30",
] as const;

export type ChallengeRating = (typeof CHALLENGE_RATINGS)[number];

/** Experience Points by Challenge Rating. CR 0 is 10 XP if the creature can fight. */
const CHALLENGE_XP: Record<ChallengeRating, number> = {
  "0": 10, "1/8": 25, "1/4": 50, "1/2": 100,
  "1": 200, "2": 450, "3": 700, "4": 1100, "5": 1800,
  "6": 2300, "7": 2900, "8": 3900, "9": 5000, "10": 5900,
  "11": 7200, "12": 8400, "13": 10000, "14": 11500, "15": 13000,
  "16": 15000, "17": 18000, "18": 20000, "19": 22000, "20": 25000,
  "21": 33000, "22": 41000, "23": 50000, "24": 62000, "25": 75000,
  "26": 90000, "27": 105000, "28": 120000, "29": 135000, "30": 155000,
};

export function challengeXp(challenge: ChallengeRating): number {
  return CHALLENGE_XP[challenge] ?? 0;
}

/** Proficiency Bonus by Challenge Rating: +2 through CR 4, then +1 per 4 CR. */
export function challengeProficiencyBonus(challenge: ChallengeRating): number {
  const numeric = challenge.includes("/") ? 0 : Number(challenge);
  return 2 + Math.max(0, Math.floor((numeric - 1) / 4));
}

export interface CreatureSpeeds {
  walk: number;
  burrow: number;
  climb: number;
  fly: number;
  swim: number;
  hover: boolean;
}

export const DEFAULT_CREATURE_SPEEDS: CreatureSpeeds = {
  walk: 30,
  burrow: 0,
  climb: 0,
  fly: 0,
  swim: 0,
  hover: false,
};

export function formatSpeeds(speeds: CreatureSpeeds): string {
  const extra = (
    [
      ["burrow", speeds.burrow],
      ["climb", speeds.climb],
      ["fly", speeds.fly],
      ["swim", speeds.swim],
    ] as const
  )
    .filter(([, distance]) => distance > 0)
    .map(
      ([mode, distance]) =>
        `${mode} ${distance} ft.${mode === "fly" && speeds.hover ? " (hover)" : ""}`
    );
  return [`${speeds.walk} ft.`, ...extra].join(", ");
}

/**
 * A Monster Manual stat block. Creatures that have one are defined entirely by
 * these numbers: their armor class and hit points are authored rather than
 * derived from equipment, and their proficiency bonus comes from challenge
 * rating instead of level. They have no race, class, or background.
 */
export interface StatBlock {
  /** Parenthetical tags after the type, e.g. ["goblinoid"] or ["devil", "shapechanger"]. */
  tags: string[];
  alignment: string;
  challenge: ChallengeRating;
  /** Parenthetical note after AC, e.g. "natural armor" or "chain shirt, shield". */
  armorNote: string;
  /** Number of Hit Dice. The die size comes from the creature's size; 0 keeps the authored max HP. */
  hitDice: number;
  speeds: CreatureSpeeds;
  saveProficiencies: Array<keyof AbilityScores>;
  senses: string[];
  languages: string[];
  vulnerabilities: string[];
  resistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  sourcePage: number;
}

export type StatBlockPatch = Partial<Omit<StatBlock, "speeds">> & {
  speeds?: Partial<CreatureSpeeds>;
};

export function createStatBlock(patch: StatBlockPatch = {}): StatBlock {
  return {
    tags: [],
    alignment: "Unaligned",
    challenge: "0",
    armorNote: "",
    hitDice: 0,
    saveProficiencies: [],
    senses: [],
    languages: [],
    vulnerabilities: [],
    resistances: [],
    damageImmunities: [],
    conditionImmunities: [],
    sourcePage: 0,
    ...patch,
    speeds: { ...DEFAULT_CREATURE_SPEEDS, ...patch.speeds },
  };
}

export function cloneStatBlock(statBlock: StatBlock): StatBlock {
  return {
    ...statBlock,
    tags: [...statBlock.tags],
    speeds: { ...statBlock.speeds },
    saveProficiencies: [...statBlock.saveProficiencies],
    senses: [...statBlock.senses],
    languages: [...statBlock.languages],
    vulnerabilities: [...statBlock.vulnerabilities],
    resistances: [...statBlock.resistances],
    damageImmunities: [...statBlock.damageImmunities],
    conditionImmunities: [...statBlock.conditionImmunities],
  };
}

/** Average hit points for a stat block, matching the Monster Manual's rounding. */
export function statBlockHitPoints(
  statBlock: StatBlock,
  size: CreatureSize,
  constitution: number
): number {
  if (statBlock.hitDice <= 0) return 0;
  const { averagePerDie } = SIZE_PROFILES[size];
  return Math.max(
    1,
    Math.floor(statBlock.hitDice * (averagePerDie + abilityMod(constitution)))
  );
}

/** The "13 (2d8 + 4)" form printed in a stat block's Hit Points line. */
export function formatHitDice(
  statBlock: StatBlock,
  size: CreatureSize,
  constitution: number
): string {
  if (statBlock.hitDice <= 0) return "";
  const bonus = statBlock.hitDice * abilityMod(constitution);
  const sign = bonus === 0 ? "" : bonus > 0 ? ` + ${bonus}` : ` - ${Math.abs(bonus)}`;
  return `${statBlock.hitDice}d${SIZE_PROFILES[size].hitDie}${sign}`;
}

export const ALIGNMENTS = [
  "Lawful Good",
  "Neutral Good",
  "Chaotic Good",
  "Lawful Neutral",
  "True Neutral",
  "Chaotic Neutral",
  "Lawful Evil",
  "Neutral Evil",
  "Chaotic Evil",
  "Unaligned",
] as const;

export const ABILITY_POINT_BUY_BUDGET = 27;
export const ABILITY_SCORE_MIN = 8;
export const ABILITY_SCORE_MAX = 15;
const POINT_BUY_COST: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function abilityPointCost(score: number): number {
  return POINT_BUY_COST[Math.max(ABILITY_SCORE_MIN, Math.min(ABILITY_SCORE_MAX, score))] ?? 0;
}

export function abilityPointsSpent(abilities: AbilityScores): number {
  return (Object.keys(abilities) as Array<keyof AbilityScores>).reduce(
    (sum, ability) => sum + abilityPointCost(abilities[ability]),
    0
  );
}

export const SKILL_TAGS = [
  "Acrobatics",
  "Animal Handling",
  "Arcana",
  "Athletics",
  "Deception",
  "History",
  "Insight",
  "Intimidation",
  "Investigation",
  "Medicine",
  "Nature",
  "Perception",
  "Performance",
  "Persuasion",
  "Religion",
  "Sleight of Hand",
  "Stealth",
  "Survival",
] as const;

export const LANGUAGE_TAGS = [
  "Common",
  "Dwarvish",
  "Elvish",
  "Giant",
  "Gnomish",
  "Goblin",
  "Halfling",
  "Orc",
  "Abyssal",
  "Celestial",
  "Draconic",
  "Deep Speech",
  "Infernal",
  "Primordial",
  "Sylvan",
  "Undercommon",
] as const;

export const SENSE_TAGS = [
  "Blindsight 10 ft.",
  "Blindsight 30 ft.",
  "Darkvision 60 ft.",
  "Darkvision 120 ft.",
  "Tremorsense 30 ft.",
  "Truesight 30 ft.",
] as const;

export const CONDITION_TAGS = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;

export const PROFICIENCY_TAGS = [
  ...SKILL_TAGS,
  "Light armor",
  "Medium armor",
  "Heavy armor",
  "Shields",
  "Simple weapons",
  "Martial weapons",
  "Artisan's tools",
  "Disguise kit",
  "Forgery kit",
  "Herbalism kit",
  "Navigator's tools",
  "Poisoner's kit",
  "Thieves' tools",
] as const;

export interface Wallet {
  copper: number;
  silver: number;
  gold: number;
}

export const RULE_KINDS = [
  "race",
  "subrace",
  "class",
  "subclass",
  "background",
] as const;
export type RuleKind = (typeof RULE_KINDS)[number];

export type RuleChoiceTarget =
  | "ability"
  | "language"
  | "proficiency"
  | "expertise"
  | "action"
  | "trait";

export interface RuleLevelCount {
  level: number;
  count: number;
}

export interface RuleChoiceDefinition {
  id: string;
  label: string;
  target: RuleChoiceTarget;
  level: number;
  count: number;
  levelCounts?: RuleLevelCount[];
  options: string[];
  bonus?: number;
  allowCustom?: boolean;
}

export interface RuleFeatureGrants {
  expertise?: string[];
  halfProficiencyAbilities?: Array<keyof AbilityScores>;
}

export interface RuleFeature {
  level: number;
  name: string;
  /** Compact mechanical wording, intended for both the UI and AI context. */
  effect: string;
  grants?: RuleFeatureGrants;
}

export interface RuleLevelValue {
  level: number;
  value: number | string;
}

/**
 * A level-scaled class value recorded for later combat automation. These
 * definitions are reference data only; they are not spendable resources yet.
 */
export interface RuleResourceTrack {
  id: string;
  name: string;
  unit: string;
  values: RuleLevelValue[];
}

export type RuleSpellcastingMode = "standard" | "pact";

/**
 * Spell progression metadata. Spell selection and slot consumption are
 * intentionally deferred, but keeping the table structured avoids another
 * character-data migration when those mechanics are added.
 */
export interface RuleSpellcasting {
  mode: RuleSpellcastingMode;
  ability: keyof AbilityScores;
  slotsByLevel: number[][];
  /** Pact Magic records the slot level separately from its slot count. */
  slotLevels?: number[];
  cantripsKnown?: number[];
  spellsKnown?: number[];
}

export interface AbilityImprovement {
  level: number;
  increases: Partial<AbilityScores>;
}

export interface RuleDefinition {
  id: string;
  kind: RuleKind;
  name: string;
  parentId?: string;
  minLevel: number;
  abilityScoreImprovementLevels: number[];
  resourceTracks: RuleResourceTrack[];
  spellcasting: RuleSpellcasting | null;
  abilityBonuses: Partial<AbilityScores>;
  saveBonuses: Partial<AbilityScores>;
  extraHp: number;
  hpPerLevel: number;
  armorBonus: number;
  speed: number;
  saveProficiencies: Array<keyof AbilityScores>;
  proficiencies: string[];
  skillBonuses: Skill[];
  senses: string[];
  languages: string[];
  vulnerabilities: string[];
  resistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  specialActions: string[];
  features: RuleFeature[];
  hitDie: number;
  creatureSize?: CreatureSize;
  sourcePage: number;
  unarmoredAcAbilities: Array<keyof AbilityScores>;
  startingKit: StartingKitItem[];
  choices: RuleChoiceDefinition[];
  creatureType?: CreatureType;
  notes: string;
}

export interface Skill {
  id: string;
  name: string;
  bonus: number;
}

export interface Trait {
  id: string;
  name: string;
  description: string;
}

export const STATUS_EFFECT_PRESETS = [
  { id: "blessed", name: "Blessed", kind: "buff", color: "#d6c46f" },
  { id: "hasted", name: "Hasted", kind: "buff", color: "#55d6c2" },
  { id: "inspired", name: "Inspired", kind: "buff", color: "#c77dff" },
  { id: "hidden", name: "Hidden", kind: "buff", color: "#7a8aa8" },
  { id: "invisible", name: "Invisible", kind: "buff", color: "#8da7ff" },
  { id: "regenerating", name: "Regenerating", kind: "buff", color: "#58c878" },
  { id: "shielded", name: "Shielded", kind: "buff", color: "#68a9ff" },
  { id: "bleeding", name: "Bleeding", kind: "debuff", color: "#c83e4d" },
  { id: "blinded", name: "Blinded", kind: "debuff", color: "#9299aa" },
  { id: "burning", name: "Burning", kind: "debuff", color: "#ff7043" },
  { id: "charmed", name: "Charmed", kind: "debuff", color: "#ef7ac8" },
  { id: "frightened", name: "Frightened", kind: "debuff", color: "#9467bd" },
  { id: "grappled", name: "Grappled", kind: "debuff", color: "#c58a5c" },
  { id: "paralyzed", name: "Paralyzed", kind: "debuff", color: "#e6d45a" },
  { id: "poisoned", name: "Poisoned", kind: "debuff", color: "#78b84a" },
  { id: "prone", name: "Prone", kind: "debuff", color: "#b08968" },
  { id: "restrained", name: "Restrained", kind: "debuff", color: "#d96d6d" },
  { id: "slowed", name: "Slowed", kind: "debuff", color: "#5e81ac" },
  { id: "stunned", name: "Stunned", kind: "debuff", color: "#f2a65a" },
  { id: "unconscious", name: "Unconscious", kind: "debuff", color: "#5b6074" },
] as const;

export type StatusEffectPresetId = (typeof STATUS_EFFECT_PRESETS)[number]["id"];

export interface StatusEffect {
  id: string;
  name: string;
  kind: "buff" | "debuff";
  note: string;
  effectId?: StatusEffectPresetId;
  color?: string;
}

export function statusEffectColor(status: StatusEffect): string {
  return (
    status.color ||
    STATUS_EFFECT_PRESETS.find((preset) => preset.id === status.effectId)?.color ||
    (status.kind === "buff" ? "#68a9ff" : "#d96d6d")
  );
}

export interface DeathSaveState {
  successes: number;
  failures: number;
  stable: boolean;
  dead: boolean;
}

export function emptyDeathSaves(): DeathSaveState {
  return { successes: 0, failures: 0, stable: false, dead: false };
}

export function normalizeDeathSaves(
  value?: Partial<DeathSaveState> | null
): DeathSaveState {
  const dead = Boolean(value?.dead);
  const successes = Math.max(0, Math.min(3, Math.round(value?.successes ?? 0)));
  const failures = Math.max(0, Math.min(3, Math.round(value?.failures ?? 0)));
  return {
    successes: dead ? Math.max(successes, 0) : successes,
    failures: dead ? Math.max(failures, 3) : failures,
    stable: !dead && Boolean(value?.stable),
    dead: dead || failures >= 3,
  };
}

export interface CreatureMechanics {
  raceId: string;
  subraceId: string;
  classId: string;
  subclassId: string;
  backgroundId: string;
  race: string;
  subrace: string;
  className: string;
  subclass: string;
  backgroundName: string;
  ruleChoices: Record<string, string[]>;
  abilityImprovements: AbilityImprovement[];
  creatureType: CreatureType;
  size: CreatureSize;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  abilities: AbilityScores;
  /** For stat block creatures these are the printed totals, not bonuses to add. */
  skills: Skill[];
  /** Special traits, such as Pack Tactics or Nimble Escape. */
  traits: Trait[];
  /** Actions, bonus actions, and reactions. */
  features: Trait[];
  inventory: Item[];
  wallet: Wallet;
  statuses: StatusEffect[];
  /** Present on monsters, NPCs, and objects; null on character-built creatures. */
  statBlock: StatBlock | null;
  /** 5e death-save tracker. Absent means the creature has never been dying. */
  deathSaves?: DeathSaveState;
}

export function usesStatBlock(creature: CreatureMechanics): boolean {
  return creature.statBlock !== null;
}

export interface PC extends CreatureMechanics {
  id: string;
  name: string;
  alignment: string;
  personality: string;
  /** Current private objective, kept across turns for multi-step plans. */
  goal: string;
  /**
   * Facts only this character already knows: secrets, hooks, grudges.
   * Always sent to this PC and never to another.
   */
  knowledge: string;
  color: string;
  /** Optional token art (data URL), e.g. a 2-Minute Tabletop token. */
  image?: string;
  /** Face portrait, separate from the map token. */
  portrait?: string;
  /** Sprite size relative to one grid cell. Occupied bounds are unchanged. */
  visualScale: number;
  hidden: boolean;
  /** Dexterity (Stealth) check total kept while hidden or invisible. */
  stealthTotal: number | null;
  width: number;
  height: number;
  bounds: TokenCell[];
  x: number;
  y: number;
}

export type TokenKind = "enemy" | "npc" | "object";

export const NPC_STANCES = ["friendly", "ally", "hostile"] as const;
export type NpcStance = (typeof NPC_STANCES)[number];

export const NPC_STANCE_LABELS: Record<NpcStance, string> = {
  friendly: "Friendly",
  ally: "Ally",
  hostile: "Hostile",
};

export function defaultStanceForKind(kind: TokenKind): NpcStance {
  return kind === "enemy" ? "hostile" : "friendly";
}

export const VISUAL_SCALE_MIN = 0.25;
export const VISUAL_SCALE_MAX = 3;
export const DEFAULT_VISUAL_SCALE = 1;

export function normalizeVisualScale(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_VISUAL_SCALE;
  return (
    Math.round(
      Math.max(VISUAL_SCALE_MIN, Math.min(VISUAL_SCALE_MAX, value)) * 20
    ) / 20
  );
}

export interface TokenCell {
  x: number;
  y: number;
}

export interface MapToken extends CreatureMechanics {
  id: string;
  blueprintId?: string;
  kind: TokenKind;
  /**
   * GM-only fight logistics. Friendly stands with the party but is not a
   * teammate, allies count as party, hostiles fight the party.
   */
  stance: NpcStance;
  /** The base type PCs should understand, such as "Dog" or "Chair". */
  name: string;
  /** Optional proper name, rendered alongside the base type. */
  givenName: string;
  color: string;
  image?: string;
  portrait?: string;
  /** Sprite size relative to one grid cell. Occupied bounds are unchanged. */
  visualScale: number;
  hidden: boolean;
  /** Dexterity (Stealth) check total kept while hidden or invisible. */
  stealthTotal: number | null;
  notes: string;
  /** Grid cells occupied by this token. */
  width: number;
  height: number;
  bounds: TokenCell[];
  x: number;
  y: number;
}

export interface TokenBlueprint extends CreatureMechanics {
  id: string;
  source: "built-in" | "custom";
  kind: TokenKind;
  stance: NpcStance;
  name: string;
  color: string;
  image?: string;
  portrait?: string;
  visualScale: number;
  notes: string;
  width: number;
  height: number;
  bounds: TokenCell[];
}

export function rectangularTokenBounds(width: number, height: number): TokenCell[] {
  return Array.from({ length: Math.max(1, height) }, (_, y) =>
    Array.from({ length: Math.max(1, width) }, (__, x) => ({ x, y }))
  ).flat();
}

export function tokenBoundsSize(bounds: TokenCell[]): { width: number; height: number } {
  if (bounds.length === 0) return { width: 1, height: 1 };
  const xs = bounds.map((cell) => cell.x);
  const ys = bounds.map((cell) => cell.y);
  return {
    width: Math.max(...xs) - Math.min(...xs) + 1,
    height: Math.max(...ys) - Math.min(...ys) + 1,
  };
}

export function tokenDisplayName(token: Pick<MapToken, "name" | "givenName">): string {
  const givenName = token.givenName.trim();
  return givenName ? `${givenName} — ${token.name}` : token.name;
}

export function inventoryFromKit(
  kit: StartingKitItem[],
  libraryItems: LibraryItem[]
): Item[] {
  let mainHandUsed = false;
  let mainHandTwoHanded = false;
  let offHandUsed = false;
  let armorUsed = false;
  let gearIndex = 1;
  return kit.map((entry) => {
    const catalog = libraryItems.find((item) => item.id === entry.libraryItemId);
    let equippedSlot: EquipmentSlot | undefined;
    if (entry.equipped && catalog) {
      if (catalog.category === "armor" && catalog.equipSlot !== "shield" && !armorUsed) {
        equippedSlot = "armor";
        armorUsed = true;
      } else if (
        (catalog.category === "weapon" || catalog.equipSlot === "shield") &&
        !mainHandUsed
      ) {
        equippedSlot = "mainHand";
        mainHandUsed = true;
        mainHandTwoHanded = catalog.properties.some(
          (property) => property.toLowerCase() === "two-handed"
        );
      } else if (
        (catalog.category === "weapon" || catalog.equipSlot === "shield") &&
        !offHandUsed &&
        !mainHandTwoHanded &&
        !catalog.properties.some((property) => property.toLowerCase() === "two-handed")
      ) {
        equippedSlot = "offHand";
        offHandUsed = true;
      } else if (catalog.category === "gear" && gearIndex <= 3) {
        equippedSlot = `gear${gearIndex}` as EquipmentSlot;
        gearIndex += 1;
      }
    }
    return {
      id: crypto.randomUUID(),
      libraryItemId: entry.libraryItemId,
      name: catalog?.name ?? entry.libraryItemId,
      qty: Math.max(1, entry.qty),
      notes: "",
      equipped: Boolean(equippedSlot),
      equippedSlot,
    };
  });
}

export function assignEquipmentSlots(
  inventory: Item[],
  libraryItems: LibraryItem[]
): Item[] {
  const occupied = new Set<EquipmentSlot>(
    inventory
      .map((item) => item.equippedSlot)
      .filter((slot): slot is EquipmentSlot => Boolean(slot))
  );
  let mainHandTwoHanded = inventory.some((item) => {
    if (item.equippedSlot !== "mainHand") return false;
    const catalog = libraryItems.find((entry) => entry.id === item.libraryItemId);
    return Boolean(
      catalog?.properties.some((property) => property.toLowerCase() === "two-handed")
    );
  });
  return inventory.map((item) => {
    if (item.equippedSlot || !item.equipped) return item;
    const catalog = libraryItems.find((entry) => entry.id === item.libraryItemId);
    if (!catalog) return item;
    let equippedSlot: EquipmentSlot | undefined;
    if (
      catalog.category === "armor" &&
      catalog.equipSlot !== "shield" &&
      !occupied.has("armor")
    ) {
      equippedSlot = "armor";
    } else if (
      (catalog.category === "weapon" || catalog.equipSlot === "shield") &&
      !occupied.has("mainHand")
    ) {
      equippedSlot = "mainHand";
      mainHandTwoHanded = catalog.properties.some(
        (property) => property.toLowerCase() === "two-handed"
      );
    } else if (
      (catalog.category === "weapon" || catalog.equipSlot === "shield") &&
      !occupied.has("offHand") &&
      !mainHandTwoHanded &&
      !catalog.properties.some((property) => property.toLowerCase() === "two-handed")
    ) {
      equippedSlot = "offHand";
    } else if (catalog.category === "gear") {
      equippedSlot = (["gear1", "gear2", "gear3"] as EquipmentSlot[]).find(
        (slot) => !occupied.has(slot)
      );
    }
    if (!equippedSlot) return { ...item, equipped: false };
    occupied.add(equippedSlot);
    return { ...item, equipped: true, equippedSlot };
  });
}

export const SKILL_ABILITIES: Record<(typeof SKILL_TAGS)[number], keyof AbilityScores> = {
  Acrobatics: "dex",
  "Animal Handling": "wis",
  Arcana: "int",
  Athletics: "str",
  Deception: "cha",
  History: "int",
  Insight: "wis",
  Intimidation: "cha",
  Investigation: "int",
  Medicine: "wis",
  Nature: "int",
  Perception: "wis",
  Performance: "cha",
  Persuasion: "cha",
  Religion: "int",
  "Sleight of Hand": "dex",
  Stealth: "dex",
  Survival: "wis",
};

export interface CalculatedCreatureStats {
  maxHp: number;
  armorClass: number;
  proficiencyBonus: number;
  speed: number;
  saveDc: number;
  savingThrows: Partial<Record<keyof AbilityScores, number>>;
  abilityScores: Record<AbilityKey, number>;
  abilityModifiers: Record<AbilityKey, number>;
  abilityCheckModifiers: Record<AbilityKey, number>;
  proficiencies: string[];
  expertise: string[];
  halfProficiencyAbilities: Array<keyof AbilityScores>;
  abilityImprovementLevels: number[];
  abilityImprovementsEarned: number;
  abilityImprovementsSpent: number;
  pendingChoices: Array<{
    key: string;
    label: string;
    level: number;
    count: number;
    selected: number;
  }>;
  spellcasting: CalculatedSpellcasting | null;
  resources: CalculatedResource[];
  senses: string[];
  languages: string[];
  vulnerabilities: string[];
  resistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  skillBonuses: string[];
  specialActions: string[];
  stealthDisadvantage: boolean;
  skillModifiers: Partial<Record<(typeof SKILL_TAGS)[number], number>>;
  passivePerception: number;
}

export interface CalculatedSpellcasting extends RuleSpellcasting {
  slots: number[];
  cantripsKnownAtLevel: number | null;
  spellsKnownAtLevel: number | null;
}

export interface CalculatedResource {
  id: string;
  name: string;
  unit: string;
  value: number | string;
}

export function ruleChoiceCountAtLevel(
  choice: RuleChoiceDefinition,
  level: number
): number {
  return [...(choice.levelCounts ?? [])]
    .filter((entry) => entry.level <= level)
    .sort((a, b) => b.level - a.level)[0]?.count ?? choice.count;
}

export function activeCreatureRules(
  creature: CreatureMechanics,
  rules: RuleDefinition[]
): RuleDefinition[] {
  if (usesStatBlock(creature)) return [];
  return [
    creature.raceId,
    creature.subraceId,
    creature.classId,
    creature.subclassId,
    creature.backgroundId,
  ]
    .map((id) => rules.find((rule) => rule.id === id))
    .filter(
      (rule): rule is RuleDefinition =>
        Boolean(rule) && (rule?.minLevel ?? 1) <= Math.max(1, creature.level)
    );
}

export function resolvedCreatureProfile(
  creature: CreatureMechanics,
  rules: RuleDefinition[]
): { creatureType: CreatureType; size: CreatureSize } {
  const activeRules = activeCreatureRules(creature, rules);
  const ancestry = activeRules.filter(
    (rule) => rule.kind === "race" || rule.kind === "subrace"
  );
  return {
    creatureType:
      [...ancestry].reverse().find((rule) => rule.creatureType)?.creatureType ??
      creature.creatureType,
    size:
      [...ancestry].reverse().find((rule) => rule.creatureSize)?.creatureSize ??
      creature.size,
  };
}

function selectedRuleChoiceValues(
  creature: CreatureMechanics,
  activeRules: RuleDefinition[],
  target: RuleChoiceTarget
): Array<{ value: string; bonus: number }> {
  return activeRules.flatMap((rule) =>
    (rule.choices ?? [])
      .filter(
        (choice) =>
          choice.target === target && (choice.level ?? 1) <= Math.max(1, creature.level)
      )
      .flatMap((choice) =>
        (creature.ruleChoices?.[`${rule.id}:${choice.id}`] ?? [])
          .slice(0, ruleChoiceCountAtLevel(choice, creature.level))
          .map((value) => ({ value, bonus: choice.bonus ?? 1 }))
      )
  );
}

function isEquipped(item: Item): boolean {
  return Boolean(item.equippedSlot || item.equipped);
}

function naturalActions(
  creature: CreatureMechanics,
  speed: number,
  strengthScore: number,
  equippedWeapons: LibraryItem[]
): string[] {
  if ("kind" in creature && creature.kind === "object") return [];
  if (creature.creatureType === "object") return [];
  const strengthMod = abilityMod(strengthScore);
  const actions = [
    `Dash: gain ${speed} ft. of extra movement this turn.`,
    "Disengage: movement does not provoke opportunity attacks this turn.",
    "Dodge: attacks you can see have disadvantage; gain advantage on Dexterity saves.",
    "Help: give an ally advantage on one nearby check or attack.",
    "Sneak/Hide: make a Dexterity (Stealth) check while sufficiently obscured.",
    `Jump: running long jump ${Math.max(0, strengthScore)} ft.; running high jump ${Math.max(
      0,
      3 + strengthMod
    )} ft.; standing jumps cover half.`,
    "Grapple: replace one attack with Athletics contested by Athletics or Acrobatics.",
    "Shove: replace one attack to push 5 ft. or knock prone using contested Athletics.",
    "Ready: choose a trigger and prepare one action or movement as a reaction.",
    "Search: make the check appropriate to what you seek.",
    "Use an Object: interact with an object that requires an action.",
  ];
  if (equippedWeapons.length === 0) {
    // A stat block prints its own attacks, so it never falls back to an unarmed strike.
    if (!usesStatBlock(creature)) {
      actions.push(
        `Unarmed Strike: melee attack; ${Math.max(0, 1 + strengthMod)} bludgeoning damage.`
      );
    }
  } else {
    actions.push(
      ...equippedWeapons.flatMap((weapon) => {
        const damage =
          `${weapon.damage || `${Math.max(1, weapon.damageDiceCount)}${weapon.damageDie}`} ${
            weapon.damageType
          }`.trim();
        return [
          `${weapon.name} Attack: ${weapon.weaponRange || "melee"} weapon attack; ${damage} damage.`,
          ...(weapon.actions ?? []),
        ];
      })
    );
  }
  return actions;
}

/**
 * Derives the printed numbers of a Monster Manual stat block. Armor class and
 * hit points are authored rather than recomputed from gear, the proficiency
 * bonus comes from challenge rating rather than level, and listed skill
 * bonuses are the final totals rather than modifiers stacked on an ability.
 */
function statBlockStats(
  creature: CreatureMechanics,
  statBlock: StatBlock,
  libraryItems: LibraryItem[]
): CalculatedCreatureStats {
  const score = (key: keyof AbilityScores) => creature.abilities[key];
  const proficiencyBonus = challengeProficiencyBonus(statBlock.challenge);
  const printedSkills = new Map(
    creature.skills.map((skill) => [skill.name.toLowerCase(), skill.bonus])
  );
  const skillModifiers = Object.fromEntries(
    SKILL_TAGS.map((skill) => [
      skill,
      printedSkills.get(skill.toLowerCase()) ??
        abilityMod(score(SKILL_ABILITIES[skill])),
    ])
  ) as Record<(typeof SKILL_TAGS)[number], number>;
  const equipped = creature.inventory
    .filter((item) => isEquipped(item) && item.libraryItemId)
    .map((item) => libraryItems.find((entry) => entry.id === item.libraryItemId))
    .filter((item): item is LibraryItem => Boolean(item));
  const bestAbility = Math.max(
    ...ABILITY_KEYS.map((key) => abilityMod(score(key)))
  );
  const speed = statBlock.speeds.walk;

  return {
    maxHp:
      statBlockHitPoints(statBlock, creature.size, score("con")) || creature.maxHp,
    armorClass: creature.ac,
    proficiencyBonus,
    speed,
    saveDc: 8 + proficiencyBonus + bestAbility,
    abilityScores: Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, score(key)])
    ) as Record<AbilityKey, number>,
    abilityModifiers: Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, abilityMod(score(key))])
    ) as Record<AbilityKey, number>,
    abilityCheckModifiers: Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, abilityMod(score(key))])
    ) as Record<AbilityKey, number>,
    savingThrows: Object.fromEntries(
      ABILITY_KEYS.map((key) => [
        key,
        abilityMod(score(key)) +
          (statBlock.saveProficiencies.includes(key) ? proficiencyBonus : 0),
      ])
    ) as Partial<Record<keyof AbilityScores, number>>,
    proficiencies: [
      ...creature.skills.map((skill) => skill.name).filter(Boolean),
      "Armor, weapons, and tools it carries",
    ],
    expertise: [],
    halfProficiencyAbilities: [],
    abilityImprovementLevels: [],
    abilityImprovementsEarned: 0,
    abilityImprovementsSpent: 0,
    pendingChoices: [],
    spellcasting: null,
    resources: [],
    senses: [...statBlock.senses],
    languages: [...statBlock.languages],
    vulnerabilities: [...statBlock.vulnerabilities],
    resistances: [...statBlock.resistances],
    damageImmunities: [...statBlock.damageImmunities],
    conditionImmunities: [...statBlock.conditionImmunities],
    skillBonuses: creature.skills.map(
      (skill) => `${skill.name} ${formatMod(skill.bonus)}`
    ),
    specialActions: [
      ...naturalActions(
        creature,
        speed,
        score("str"),
        equipped.filter((item) => item.category === "weapon")
      ),
      ...creature.traits.map((trait) => `${trait.name}: ${trait.description}`),
      ...creature.features.map((feature) => `${feature.name}: ${feature.description}`),
    ],
    stealthDisadvantage: false,
    skillModifiers,
    passivePerception: 10 + skillModifiers.Perception,
  };
}

export function calculateCreatureStats(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): CalculatedCreatureStats {
  if (creature.statBlock) {
    return statBlockStats(creature, creature.statBlock, libraryItems);
  }
  const activeRules = activeCreatureRules(creature, rules);
  const level = Math.max(1, creature.level);
  const abilityImprovementLevels = [
    ...new Set(
      activeRules
        .flatMap((rule) => rule.abilityScoreImprovementLevels ?? [])
        .filter((entry) => entry <= level)
    ),
  ].sort((a, b) => a - b);
  const storedImprovements = new Map(
    (creature.abilityImprovements ?? []).map((improvement) => [
      improvement.level,
      improvement,
    ])
  );
  const abilityImprovements = abilityImprovementLevels
    .map((improvementLevel) => storedImprovements.get(improvementLevel))
    .filter((improvement): improvement is AbilityImprovement => Boolean(improvement))
    .map((improvement) => {
      let remaining = 2;
      const increases: Partial<AbilityScores> = {};
      for (const key of ABILITY_KEYS) {
        const increase = Math.max(
          0,
          Math.min(remaining, Math.floor(improvement.increases[key] ?? 0))
        );
        if (increase > 0) increases[key] = increase;
        remaining -= increase;
      }
      return { level: improvement.level, increases };
    });
  const chosenAbilityBonuses = selectedRuleChoiceValues(creature, activeRules, "ability");
  const ability = (key: keyof AbilityScores) =>
    Math.min(
      20,
      creature.abilities[key] +
        activeRules.reduce((sum, rule) => sum + (rule.abilityBonuses[key] ?? 0), 0) +
        chosenAbilityBonuses
          .filter(({ value }) => value === key)
          .reduce((sum, choice) => sum + choice.bonus, 0) +
        abilityImprovements.reduce(
          (sum, improvement) => sum + (improvement.increases[key] ?? 0),
          0
        )
    );
  const proficiencyBonus = 2 + Math.floor((level - 1) / 4);
  const equipped = creature.inventory
    .filter((item) => isEquipped(item) && item.libraryItemId)
    .map((item) => libraryItems.find((entry) => entry.id === item.libraryItemId))
    .filter((item): item is LibraryItem => Boolean(item));
  const armor = equipped.filter((item) => item.equipSlot === "armor");
  const unarmoredArmorClass = Math.max(
    10 + abilityMod(ability("dex")),
    ...activeRules
      .filter((rule) => rule.unarmoredAcAbilities.length > 0)
      .map(
        (rule) =>
          10 +
          rule.unarmoredAcAbilities.reduce(
            (sum, key) => sum + abilityMod(ability(key)),
            0
          )
      )
  );
  const shieldBonus = Math.max(
    0,
    ...equipped
      .filter((item) => item.equipSlot === "shield")
      .map((item) => item.armorBonus)
  );
  const otherArmorBonuses = equipped
    .filter((item) => item.equipSlot !== "shield")
    .reduce((sum, item) => sum + item.armorBonus, 0);
  const armorClass =
    activeRules.length === 0 && equipped.length === 0
      ? creature.ac
      : (armor.length
          ? Math.max(
              ...armor.map((item) => {
                const dexterity = abilityMod(ability("dex"));
                const dexterityBonus =
                  item.armorDexterity === "full"
                    ? dexterity
                    : item.armorDexterity === "max2"
                      ? Math.min(2, dexterity)
                      : 0;
                return item.armorClass + dexterityBonus;
              })
            )
          : unarmoredArmorClass) +
        shieldBonus +
        otherArmorBonuses +
        activeRules.reduce((sum, rule) => sum + rule.armorBonus, 0);
  const hitDie = Math.max(0, ...activeRules.map((rule) => rule.hitDie ?? 0));
  const hpPerLevel = Math.max(0, ...activeRules.map((rule) => rule.hpPerLevel));
  const constitution = abilityMod(ability("con"));
  const calculatedHp =
    hitDie > 0
      ? Math.max(
          1,
          hitDie +
            constitution +
            (level - 1) * (Math.floor(hitDie / 2) + 1 + constitution) +
            activeRules.reduce((sum, rule) => sum + rule.extraHp * level, 0) +
            equipped.reduce((sum, item) => sum + item.hpBonus, 0)
        )
      : hpPerLevel > 0
      ? Math.max(
          1,
          hpPerLevel * level +
            constitution * level +
            activeRules.reduce((sum, rule) => sum + rule.extraHp, 0) +
            equipped.reduce((sum, item) => sum + item.hpBonus, 0)
        )
      : creature.maxHp;
  const saveProficiencies = new Set(activeRules.flatMap((rule) => rule.saveProficiencies));
  const savingThrows = Object.fromEntries(
    (Object.keys(creature.abilities) as Array<keyof AbilityScores>).map((key) => [
      key,
      abilityMod(ability(key)) +
        (saveProficiencies.has(key) ? proficiencyBonus : 0) +
        activeRules.reduce((sum, rule) => sum + (rule.saveBonuses[key] ?? 0), 0),
    ])
  ) as Partial<Record<keyof AbilityScores, number>>;
  const mentalModifier = Math.max(
    abilityMod(ability("int")),
    abilityMod(ability("wis")),
    abilityMod(ability("cha"))
  );
  const unique = (values: string[]) => [...new Set(values.filter(Boolean))];

  const speed =
    (activeRules.some((rule) => rule.speed > 0)
      ? Math.max(...activeRules.map((rule) => rule.speed))
      : 30) -
    (equipped.some(
      (item) =>
        item.equipSlot === "armor" &&
        item.strengthRequirement > ability("str")
    )
      ? 10
      : 0);
  const chosenProficiencies = selectedRuleChoiceValues(
    creature,
    activeRules,
    "proficiency"
  ).map(({ value }) => value);
  const chosenLanguages = selectedRuleChoiceValues(
    creature,
    activeRules,
    "language"
  ).map(({ value }) => value);
  const chosenActions = selectedRuleChoiceValues(creature, activeRules, "action").map(
    ({ value }) => value
  );
  const unlockedFeatures = activeRules.flatMap((rule) =>
    rule.features.filter((feature) => feature.level <= level)
  );
  const expertise = unique([
    ...unlockedFeatures.flatMap((feature) => feature.grants?.expertise ?? []),
    ...selectedRuleChoiceValues(creature, activeRules, "expertise").map(
      ({ value }) => value
    ),
  ]);
  const halfProficiencyAbilities = unique(
    unlockedFeatures.flatMap(
      (feature) => feature.grants?.halfProficiencyAbilities ?? []
    )
  ) as Array<keyof AbilityScores>;
  const equippedWeapons = equipped.filter((item) => item.category === "weapon");
  const proficiencies = unique([
    ...activeRules.flatMap((rule) => rule.proficiencies),
    ...chosenProficiencies,
  ]);
  const skillModifiers = Object.fromEntries(
    SKILL_TAGS.map((skill) => [
      skill,
      skillCheckBonusFor(
        skill,
        ability(SKILL_ABILITIES[skill]),
        proficiencyBonus,
        proficiencies,
        expertise,
        halfProficiencyAbilities.includes(SKILL_ABILITIES[skill]),
        [
          ...activeRules.flatMap((rule) => rule.skillBonuses),
          ...creature.skills,
        ]
      ),
    ])
  ) as Record<(typeof SKILL_TAGS)[number], number>;
  const stealthDisadvantage = equipped.some((item) => item.stealthDisadvantage);
  const abilityCheckModifiers = Object.fromEntries(
    ABILITY_KEYS.map((key) => [
      key,
      abilityMod(ability(key)) +
        (halfProficiencyAbilities.includes(key) ? Math.floor(proficiencyBonus / 2) : 0),
    ])
  ) as Record<AbilityKey, number>;
  const pendingChoices = activeRules.flatMap((rule) =>
    (rule.choices ?? [])
      .filter((choice) => (choice.level ?? 1) <= level)
      .map((choice) => {
        const count = ruleChoiceCountAtLevel(choice, level);
        const key = `${rule.id}:${choice.id}`;
        return {
          key,
          label: `${rule.name} — ${choice.label}`,
          level: choice.level ?? 1,
          count,
          selected: Math.min(count, creature.ruleChoices?.[key]?.length ?? 0),
        };
      })
      .filter((choice) => choice.selected < choice.count)
  );
  const spellcastingRule = [...activeRules]
    .reverse()
    .find((rule) => rule.spellcasting)?.spellcasting;
  const spellcasting: CalculatedSpellcasting | null = spellcastingRule
    ? {
        ...spellcastingRule,
        slotsByLevel: spellcastingRule.slotsByLevel.map((row) => [...row]),
        slotLevels: spellcastingRule.slotLevels
          ? [...spellcastingRule.slotLevels]
          : undefined,
        cantripsKnown: spellcastingRule.cantripsKnown
          ? [...spellcastingRule.cantripsKnown]
          : undefined,
        spellsKnown: spellcastingRule.spellsKnown
          ? [...spellcastingRule.spellsKnown]
          : undefined,
        slots: [...(spellcastingRule.slotsByLevel[level - 1] ?? [])],
        cantripsKnownAtLevel:
          spellcastingRule.cantripsKnown?.[level - 1] ?? null,
        spellsKnownAtLevel: spellcastingRule.spellsKnown?.[level - 1] ?? null,
      }
    : null;
  const resources = activeRules.flatMap((rule) =>
    (rule.resourceTracks ?? []).flatMap((track) => {
      const current = [...track.values]
        .filter((entry) => entry.level <= level)
        .sort((a, b) => b.level - a.level)[0];
      return current
        ? [{ id: `${rule.id}:${track.id}`, name: track.name, unit: track.unit, value: current.value }]
        : [];
    })
  );

  return {
    maxHp: calculatedHp,
    armorClass,
    proficiencyBonus,
    speed,
    saveDc: 8 + proficiencyBonus + mentalModifier,
    abilityScores: Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, ability(key)])
    ) as Record<AbilityKey, number>,
    abilityModifiers: Object.fromEntries(
      ABILITY_KEYS.map((key) => [key, abilityMod(ability(key))])
    ) as Record<AbilityKey, number>,
    abilityCheckModifiers,
    savingThrows,
    proficiencies,
    expertise,
    halfProficiencyAbilities,
    abilityImprovementLevels,
    abilityImprovementsEarned: abilityImprovementLevels.length,
    abilityImprovementsSpent: abilityImprovements.filter(
      (improvement) =>
        Object.values(improvement.increases).reduce((sum, increase) => sum + increase, 0) === 2
    ).length,
    pendingChoices,
    spellcasting,
    resources,
    senses: unique(activeRules.flatMap((rule) => rule.senses)),
    languages: unique([
      "Common",
      ...activeRules.flatMap((rule) => rule.languages),
      ...chosenLanguages,
    ]),
    vulnerabilities: unique(activeRules.flatMap((rule) => rule.vulnerabilities)),
    resistances: unique(activeRules.flatMap((rule) => rule.resistances)),
    damageImmunities: unique(activeRules.flatMap((rule) => rule.damageImmunities)),
    conditionImmunities: unique(activeRules.flatMap((rule) => rule.conditionImmunities)),
    skillBonuses: unique([
      ...activeRules.flatMap((rule) =>
        rule.skillBonuses.map((skill) => `${skill.name} ${formatMod(skill.bonus)}`)
      ),
      ...creature.skills.map((skill) => `${skill.name} ${formatMod(skill.bonus)}`),
    ]),
    specialActions: unique([
      ...naturalActions(creature, speed, ability("str"), equippedWeapons),
      ...activeRules.flatMap((rule) => rule.specialActions),
      ...activeRules.flatMap((rule) =>
        rule.features
          .filter((feature) => feature.level <= creature.level)
          .map((feature) => `${feature.name}: ${feature.effect}`)
      ),
      ...creature.features.map((feature) => `${feature.name}: ${feature.description}`),
      ...chosenActions,
    ]),
    stealthDisadvantage,
    skillModifiers,
    passivePerception: 10 + skillModifiers.Perception,
  };
}

function skillIsProficient(skill: string, proficiencies: string[]): boolean {
  const needle = skill.toLowerCase();
  return proficiencies.some((entry) => {
    const value = entry.toLowerCase();
    return value === needle || value.startsWith(`${needle} skill`);
  });
}

function skillCheckBonusFor(
  skill: string,
  abilityScore: number,
  proficiencyBonus: number,
  proficiencies: string[],
  expertise: string[],
  halfProficiency: boolean,
  extras: Array<{ name: string; bonus: number }>
): number {
  const extra = extras
    .filter((entry) => entry.name.toLowerCase() === skill.toLowerCase())
    .reduce((sum, entry) => sum + entry.bonus, 0);
  const proficient = skillIsProficient(skill, proficiencies);
  const expert = skillIsProficient(skill, expertise);
  return (
    abilityMod(abilityScore) +
    (expert
      ? proficiencyBonus * 2
      : proficient
        ? proficiencyBonus
        : halfProficiency
          ? Math.floor(proficiencyBonus / 2)
          : 0) +
    extra
  );
}

export interface LogEntry {
  id: string;
  ts: number;
  role: "gm" | "pc" | "system";
  author: string;
  authorId?: string;
  color?: string;
  text: string;
}

export interface MapBackground {
  /** Data URL of the map image (e.g. from 2-Minute Tabletop). */
  src: string;
  /** World-units-per-image-pixel scale multiplier. */
  scale: number;
}

export const ENVIRONMENT_LIGHTING = [
  "dawn",
  "sunrise",
  "morning",
  "noon",
  "midday",
  "dusk",
  "twilight",
  "night",
  "midnight",
] as const;
export type EnvironmentLighting = (typeof ENVIRONMENT_LIGHTING)[number];

export const ENVIRONMENT_LIGHTING_LABELS: Record<EnvironmentLighting, string> = {
  dawn: "Dawn",
  sunrise: "Sunrise",
  morning: "Morning",
  noon: "Noon",
  midday: "Midday",
  dusk: "Dusk",
  twilight: "Twilight",
  night: "Night",
  midnight: "Midnight",
};

const LEGACY_LIGHTING: Record<string, EnvironmentLighting> = {
  daylight: "noon",
  overcast: "morning",
  torchlit: "night",
  magical: "twilight",
};

export function isEnvironmentLighting(value: unknown): value is EnvironmentLighting {
  return (
    typeof value === "string" &&
    (ENVIRONMENT_LIGHTING as readonly string[]).includes(value)
  );
}

export function normalizeLighting(value: unknown): EnvironmentLighting {
  if (isEnvironmentLighting(value)) return value;
  if (typeof value === "string" && value in LEGACY_LIGHTING) {
    return LEGACY_LIGHTING[value];
  }
  return "noon";
}

/** Walk the shorter way around the day so dusk is a few steps back from midnight, not a full sunrise. */
export function lightingCyclePath(
  from: EnvironmentLighting,
  to: EnvironmentLighting
): EnvironmentLighting[] {
  const start = ENVIRONMENT_LIGHTING.indexOf(normalizeLighting(from));
  const end = ENVIRONMENT_LIGHTING.indexOf(normalizeLighting(to));
  if (start < 0 || end < 0 || start === end) {
    return [ENVIRONMENT_LIGHTING[end] ?? "noon"];
  }
  const count = ENVIRONMENT_LIGHTING.length;
  const forward = (end - start + count) % count;
  const backward = (start - end + count) % count;
  const path: EnvironmentLighting[] = [ENVIRONMENT_LIGHTING[start]];
  const step = forward <= backward ? 1 : -1;
  let index = start;
  while (index !== end) {
    index = (index + step + count) % count;
    path.push(ENVIRONMENT_LIGHTING[index]);
  }
  return path;
}

export const LIGHTING_STEP_MS = 900;

export const ENVIRONMENT_WEATHER = [
  "clear",
  "dust-storm",
  "raining",
  "windy",
  "heavy-wind",
  "thunderstorm",
  "storm",
  "heavy-storm",
  "heavy-rain",
] as const;
export type EnvironmentWeather = (typeof ENVIRONMENT_WEATHER)[number];

export const ENVIRONMENT_WEATHER_LABELS: Record<EnvironmentWeather, string> = {
  clear: "Clear",
  "dust-storm": "Dust storm",
  raining: "Raining",
  windy: "Windy",
  "heavy-wind": "Heavy wind",
  thunderstorm: "Thunderstorm",
  storm: "Storm",
  "heavy-storm": "Heavy storm",
  "heavy-rain": "Heavy rain",
};

export function isEnvironmentWeather(value: unknown): value is EnvironmentWeather {
  return (
    typeof value === "string" &&
    (ENVIRONMENT_WEATHER as readonly string[]).includes(value)
  );
}

export function normalizeWeather(value: unknown): EnvironmentWeather {
  return isEnvironmentWeather(value) ? value : "clear";
}

export function weatherHasRain(
  weather: EnvironmentWeather
): "none" | "rain" | "heavy" {
  if (weather === "heavy-rain" || weather === "heavy-storm") return "heavy";
  if (weather === "raining" || weather === "storm") return "rain";
  return "none";
}

export function weatherHasWind(
  weather: EnvironmentWeather
): "none" | "wind" | "heavy" {
  if (
    weather === "heavy-wind" ||
    weather === "thunderstorm" ||
    weather === "dust-storm"
  ) {
    return "heavy";
  }
  if (weather === "windy" || weather === "storm" || weather === "heavy-storm") {
    return "wind";
  }
  return "none";
}

export function weatherHasThunder(weather: EnvironmentWeather): boolean {
  return (
    weather === "thunderstorm" ||
    weather === "storm" ||
    weather === "heavy-storm"
  );
}

export function weatherHasDust(weather: EnvironmentWeather): boolean {
  return weather === "dust-storm";
}

export interface EnvironmentTrack {
  src: string;
  /** 0–1 multiplier on top of the master mix. */
  volume: number;
}

export const DEFAULT_TRACK_VOLUME = 0.7;
export const SCENE_TRANSITION_MS = 2400;

export function normalizeTrackVolume(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_TRACK_VOLUME;
  return Math.max(0, Math.min(1, Math.round(value * 100) / 100));
}

export function cloneEnvironmentTrack(
  track: EnvironmentTrack | null | undefined
): EnvironmentTrack | null {
  if (!track?.src) return null;
  return { src: track.src, volume: normalizeTrackVolume(track.volume) };
}

export const SAVE_AREA_COLORS = [
  "#5e81ac",
  "#b48ead",
  "#a3be8c",
  "#d08770",
  "#bf616a",
  "#ebcb8b",
] as const;

export const TOKEN_FLOATER_MS = 2400;
export const CREATURE_SHEEN_MS = 750;

export type CreatureSheenKind = "levelup" | "buff" | "debuff";

export const CREATURE_SHEEN_COLORS: Record<CreatureSheenKind, string> = {
  levelup: "#ffd65a",
  buff: "#50c876",
  debuff: "#dc4850",
};

export interface CreatureSheen {
  id: string;
  creatureId: string;
  kind: CreatureSheenKind;
  bornAt: number;
}

export function activeCreatureSheen(
  creatureId: string,
  sheens: CreatureSheen[],
  now = Date.now()
): CreatureSheen | null {
  let latest: CreatureSheen | null = null;
  for (const sheen of sheens) {
    if (sheen.creatureId !== creatureId) continue;
    if (now - sheen.bornAt < 0 || now - sheen.bornAt >= CREATURE_SHEEN_MS) continue;
    if (!latest || sheen.bornAt > latest.bornAt) latest = sheen;
  }
  return latest;
}

export interface SaveArea {
  id: string;
  name: string;
  color: string;
  cells: TokenCell[];
  saveAbility: AbilityKey;
  dc: number;
  damageDiceCount: number;
  damageDie: DamageDie;
  damageType: string;
  halfOnSuccess: boolean;
  failStatusId: StatusEffectPresetId | "";
}

export interface AreaPresence {
  creatureId: string;
  areaId: string;
}

export interface TokenFloater {
  id: string;
  creatureId: string;
  title: string;
  detail: string;
  outcome: "success" | "fail" | "info";
  color?: string;
  bornAt: number;
}

export type ToolAutonomy = "announce" | "propose" | "auto";

/**
 * How hard the turn economy pushes back. `advisory` reports overspending
 * without preventing it; `strict` clamps illegal moves.
 */
export type CombatRules = "off" | "advisory" | "strict";

export interface GameplaySettings {
  toolsEnabled: boolean;
  maxToolSteps: number;
  movement: ToolAutonomy;
  actions: ToolAutonomy;
  rolls: ToolAutonomy;
  bookkeeping: ToolAutonomy;
  intentBubbles: boolean;
  revealHazards: boolean;
  combatRules: CombatRules;
  combatVignette: boolean;
  combatMusicEnabled: boolean;
  autoDeathSaves: boolean;
}

export const DEFAULT_GAMEPLAY_SETTINGS: GameplaySettings = {
  toolsEnabled: true,
  maxToolSteps: 6,
  movement: "announce",
  actions: "announce",
  rolls: "propose",
  bookkeeping: "auto",
  intentBubbles: true,
  revealHazards: false,
  combatRules: "advisory",
  combatVignette: true,
  combatMusicEnabled: true,
  autoDeathSaves: false,
};

export function normalizeGameplaySettings(
  value: Partial<GameplaySettings> = {}
): GameplaySettings {
  const autonomy = (entry: unknown, fallback: ToolAutonomy): ToolAutonomy =>
    entry === "announce" || entry === "propose" || entry === "auto" ? entry : fallback;
  const combatRules = (entry: unknown, fallback: CombatRules): CombatRules =>
    entry === "off" || entry === "advisory" || entry === "strict" ? entry : fallback;
  return {
    toolsEnabled: value.toolsEnabled ?? DEFAULT_GAMEPLAY_SETTINGS.toolsEnabled,
    maxToolSteps: Math.max(
      1,
      Math.min(12, Math.round(value.maxToolSteps ?? DEFAULT_GAMEPLAY_SETTINGS.maxToolSteps))
    ),
    movement: autonomy(value.movement, DEFAULT_GAMEPLAY_SETTINGS.movement),
    actions: autonomy(value.actions, DEFAULT_GAMEPLAY_SETTINGS.actions),
    rolls: autonomy(value.rolls, DEFAULT_GAMEPLAY_SETTINGS.rolls),
    bookkeeping: autonomy(value.bookkeeping, DEFAULT_GAMEPLAY_SETTINGS.bookkeeping),
    intentBubbles: value.intentBubbles ?? DEFAULT_GAMEPLAY_SETTINGS.intentBubbles,
    revealHazards: value.revealHazards ?? DEFAULT_GAMEPLAY_SETTINGS.revealHazards,
    combatRules: combatRules(value.combatRules, DEFAULT_GAMEPLAY_SETTINGS.combatRules),
    combatVignette: value.combatVignette ?? DEFAULT_GAMEPLAY_SETTINGS.combatVignette,
    combatMusicEnabled:
      value.combatMusicEnabled ?? DEFAULT_GAMEPLAY_SETTINGS.combatMusicEnabled,
    autoDeathSaves: value.autoDeathSaves ?? DEFAULT_GAMEPLAY_SETTINGS.autoDeathSaves,
  };
}

export type ActionSlot = "action" | "bonusAction" | "reaction";

export interface Combatant {
  /** Matches a `PC.id` or a `MapToken.id`. */
  id: string;
  isPC: boolean;
  /** d20 + dexMod, what the order sorts on. */
  initiative: number;
  d20: number;
  dexMod: number;
  /** Stable random, breaks exact initiative ties without reshuffling on re-render. */
  tiebreak: number;
  /** Feet moved so far this turn. */
  movementUsed: number;
  dashes: number;
  action: boolean;
  bonusAction: boolean;
  reaction: boolean;
}

export interface CombatState {
  round: number;
  turnIndex: number;
  combatants: Combatant[];
  startedAt: number;
}

export interface TokenIntent {
  id: string;
  creatureId: string;
  kind: "move" | "action" | "roll" | "ask" | "bookkeeping";
  title: string;
  detail: string;
  autonomy: Exclude<ToolAutonomy, "auto">;
  targetCell?: TokenCell;
  checkId?: string;
  payload?: Record<string, string | number | boolean>;
  status: "pending" | "accepted" | "dismissed";
  createdAt: number;
}

export function creatureFeedbackFloater(
  creatureId: string,
  kind: CreatureSheenKind,
  title: string,
  detail = ""
): Omit<TokenFloater, "id" | "bornAt"> {
  return {
    creatureId,
    title,
    detail,
    outcome: kind === "debuff" ? "fail" : kind === "buff" ? "success" : "info",
    color: CREATURE_SHEEN_COLORS[kind],
  };
}

export function cloneSaveArea(area: SaveArea): SaveArea {
  return {
    ...area,
    cells: area.cells.map((cell) => ({ ...cell })),
  };
}

export function normalizeSaveDc(value: number): number {
  if (!Number.isFinite(value)) return 13;
  return Math.max(1, Math.min(40, Math.round(value)));
}

export function normalizeSaveArea(value: Partial<SaveArea> & { id: string }): SaveArea {
  const ability = ABILITY_KEYS.includes(value.saveAbility as AbilityKey)
    ? (value.saveAbility as AbilityKey)
    : "dex";
  const die = DAMAGE_DICE.includes(value.damageDie as DamageDie)
    ? (value.damageDie as DamageDie)
    : "d6";
  const failStatusId =
    value.failStatusId &&
    STATUS_EFFECT_PRESETS.some((preset) => preset.id === value.failStatusId)
      ? value.failStatusId
      : "";
  const cells = (value.cells ?? []).map((cell) => ({ x: cell.x, y: cell.y }));
  return {
    id: value.id,
    name: value.name?.trim() || "Hazard",
    color:
      value.color && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.color)
        ? value.color
        : SAVE_AREA_COLORS[0],
    cells: cells.length ? cells : [{ x: 0, y: 0 }],
    saveAbility: ability,
    dc: normalizeSaveDc(value.dc ?? 13),
    damageDiceCount: Math.max(0, Math.min(20, Math.round(value.damageDiceCount ?? 0))),
    damageDie: die,
    damageType: value.damageType ?? "",
    halfOnSuccess: Boolean(value.halfOnSuccess),
    failStatusId,
  };
}

export function createSaveArea(
  cells: TokenCell[],
  index = 0
): SaveArea {
  return normalizeSaveArea({
    id: crypto.randomUUID(),
    name: index === 0 ? "Hazard" : `Hazard ${index + 1}`,
    color: SAVE_AREA_COLORS[index % SAVE_AREA_COLORS.length],
    cells: cells.length ? cells : [{ x: 0, y: 0 }],
    saveAbility: "dex",
    dc: 13,
    damageDiceCount: 0,
    damageDie: "d6",
    damageType: "",
    halfOnSuccess: false,
    failStatusId: "",
  });
}

export interface Environment {
  id: string;
  name: string;
  notes: string;
  lighting: EnvironmentLighting;
  weather: EnvironmentWeather;
  background: MapBackground | null;
  music: EnvironmentTrack | null;
  ambience: EnvironmentTrack | null;
  /** Overrides the campaign-wide battle track while this scene is active. */
  battleMusic: EnvironmentTrack | null;
  tokens: MapToken[];
  saveAreas: SaveArea[];
}

export interface SceneTransition {
  startedAt: number;
  durationMs: number;
  fromLighting: EnvironmentLighting;
  fromBackground: MapBackground | null;
  fromTokens: MapToken[];
}

export interface LightingTransition {
  startedAt: number;
  durationMs: number;
  path: EnvironmentLighting[];
}

export interface WeatherTransition {
  startedAt: number;
  durationMs: number;
  fromWeather: EnvironmentWeather;
}

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}

/** Grid scale used when describing distances to AI characters. */
export const FEET_PER_CELL = 5;

/**
 * Rolling digest of console history that has scrolled out of the verbatim
 * window, so characters keep earlier session facts without resending the log.
 */
export interface SessionMemory {
  bullets: string[];
  /** Last log entry folded into the digest. */
  throughLogId: string | null;
  /** How many log entries the digest covers. */
  coveredCount: number;
  updatedAt: number;
}

export const DEFAULT_SESSION_MEMORY: SessionMemory = {
  bullets: [],
  throughLogId: null,
  coveredCount: 0,
  updatedAt: 0,
};

export const DEFAULT_GRID_SIZE = 64;
export const DEFAULT_GRID_OPACITY = 12;

export function normalizeGridSize(_value?: number): number {
  return DEFAULT_GRID_SIZE;
}

export function temporaryHp(hp: number, maxHp: number): number {
  return Math.max(0, hp - Math.max(0, maxHp));
}

export function realHp(hp: number, maxHp: number): number {
  return Math.max(0, Math.min(hp, Math.max(0, maxHp)));
}

export function normalizeGridOpacity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const AI_PROVIDERS = [
  "ollama",
  "openai",
  "openai-codex",
  "azure",
  "anthropic",
  "google",
  "openrouter",
  "groq",
  "mistral",
  "deepseek",
  "together",
  "fireworks",
  "xai",
  "perplexity",
  "cohere",
  "custom",
] as const;

export type AIProvider = (typeof AI_PROVIDERS)[number];
export type AIReasoningEffort = "none" | "low" | "medium" | "high" | "xhigh";

export const AI_REASONING_EFFORTS: AIReasoningEffort[] = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
];

export interface AISettings {
  provider: AIProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  reasoningEffort: AIReasoningEffort;
  extraInstructions: string;
  /** How far a character perceives the map, in feet. */
  perceptionRadius: number;
  /** Token ceiling for keyword-matched rules, items, and lore. */
  loreBudget: number;
  /** Keep a rolling digest of console history that left the window. */
  memoryEnabled: boolean;
  /** Maximum bullets kept in that digest. */
  memoryBullets: number;
  azureDeployment: string;
  azureApiVersion: string;
  savedKeys: Partial<Record<AIProvider, string>>;
  savedModels: Partial<Record<AIProvider, string>>;
  savedBaseUrls: Partial<Record<AIProvider, string>>;
}

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "openai",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-5.6-luna",
  temperature: 0.85,
  maxTokens: 400,
  contextWindow: 16,
  reasoningEffort: "medium",
  extraInstructions: "",
  perceptionRadius: 60,
  loreBudget: 600,
  memoryEnabled: true,
  memoryBullets: 10,
  azureDeployment: "",
  azureApiVersion: "2024-10-21",
  savedKeys: {},
  savedModels: {},
  savedBaseUrls: {},
};

export const UI_PALETTES = [
  "default",
  "marble",
  "high-contrast",
  "gilded",
  "nord",
  "dracula",
  "catppuccin",
  "solarized",
  "tokyo-night",
  "gruvbox",
] as const;

export type UIPalette = (typeof UI_PALETTES)[number];
export type UITextScale = "default" | "large" | "largest";
export type UIDensity = "dense" | "compact" | "comfortable";
export type UIMotion = "system" | "full" | "reduced";
export type UITimeFormat = "system" | "12-hour" | "24-hour";

export const PALETTE_GROUPS: Array<{ label: string; ids: UIPalette[] }> = [
  { label: "RAM", ids: ["default", "marble", "high-contrast", "gilded"] },
  {
    label: "Premade",
    ids: ["nord", "dracula", "catppuccin", "solarized", "tokyo-night", "gruvbox"],
  },
];

export const PALETTE_LABELS: Record<UIPalette, string> = {
  default: "Default",
  marble: "Marble",
  "high-contrast": "High Contrast",
  gilded: "Gilded",
  nord: "Nord",
  dracula: "Dracula",
  catppuccin: "Catppuccin",
  solarized: "Solarized",
  "tokyo-night": "Tokyo Night",
  gruvbox: "Gruvbox",
};

export const PALETTE_SCHEME: Record<UIPalette, "dark" | "light"> = {
  default: "dark",
  marble: "light",
  "high-contrast": "dark",
  gilded: "dark",
  nord: "dark",
  dracula: "dark",
  catppuccin: "dark",
  solarized: "dark",
  "tokyo-night": "dark",
  gruvbox: "dark",
};

export const AUTOSAVE_EVERY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 30_000, label: "30 seconds" },
  { value: 60_000, label: "1 minute" },
  { value: 300_000, label: "5 minutes" },
  { value: 900_000, label: "15 minutes" },
  { value: 1_800_000, label: "30 minutes" },
  { value: 3_600_000, label: "1 hour" },
  { value: 0, label: "Never" },
];

export interface UISettings {
  palette: UIPalette;
  textScale: UITextScale;
  density: UIDensity;
  motion: UIMotion;
  reducedTransparency: boolean;
  increasedContrast: boolean;
  enhancedFocus: boolean;
  autoScrollConsole: boolean;
  showDiceDetails: boolean;
  diceAnimations: boolean;
  weatherEffects: boolean;
  lightingEffects: boolean;
  timeFormat: UITimeFormat;
  confirmClearConsole: boolean;
  gridSize: number;
  gridOpacity: number;
  snapToGrid: boolean;
  confirmDeletes: boolean;
  masterMuted: boolean;
  masterVolume: number;
  musicVolume: number;
  ambienceVolume: number;
  sfxVolume: number;
  autosaveEveryMs: number;
  maxConsoleEntries: number;
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  palette: "default",
  textScale: "default",
  density: "compact",
  motion: "system",
  reducedTransparency: false,
  increasedContrast: false,
  enhancedFocus: false,
  autoScrollConsole: true,
  showDiceDetails: true,
  diceAnimations: true,
  weatherEffects: true,
  lightingEffects: true,
  timeFormat: "system",
  confirmClearConsole: true,
  gridSize: DEFAULT_GRID_SIZE,
  gridOpacity: DEFAULT_GRID_OPACITY,
  snapToGrid: true,
  confirmDeletes: true,
  masterMuted: false,
  masterVolume: 100,
  musicVolume: 70,
  ambienceVolume: 80,
  sfxVolume: 80,
  autosaveEveryMs: 300_000,
  maxConsoleEntries: 2000,
};


const LEGACY_PALETTE_IDS: Record<string, UIPalette> = {
  "90s": "catppuccin",
  orchid: "catppuccin",
  nebula: "catppuccin",
  nocturne: "nord",
  ice: "nord",
  frost: "marble",
  stone: "gruvbox",
  limestone: "marble",
  "pitch-black": "high-contrast",
  obsidian: "tokyo-night",
  molten: "gruvbox",
  umber: "gruvbox",
  oxblood: "dracula",
  verdant: "nord",
  console: "nord",
  celadon: "marble",
  "pearl-white": "marble",
  parchment: "marble",
  ivory: "gilded",
};

export function isUIPalette(value: unknown): value is UIPalette {
  return typeof value === "string" && (UI_PALETTES as readonly string[]).includes(value);
}

function paletteForLegacyLightTheme(palette: UIPalette): UIPalette {
  if (PALETTE_SCHEME[palette] === "light") return palette;
  return "marble";
}

function normalizeAutosaveEveryMs(rest: Partial<UISettings> & { autosaveDelayMs?: number }): number {
  if (rest.autosaveEveryMs === 0 || rest.autosaveDelayMs === 0) return 0;
  if (typeof rest.autosaveEveryMs === "number") {
    const allowed = AUTOSAVE_EVERY_OPTIONS.some((entry) => entry.value === rest.autosaveEveryMs);
    return allowed ? rest.autosaveEveryMs : DEFAULT_UI_SETTINGS.autosaveEveryMs;
  }
  if (typeof rest.autosaveDelayMs === "number" && rest.autosaveDelayMs <= 5000) {
    return DEFAULT_UI_SETTINGS.autosaveEveryMs;
  }
  return DEFAULT_UI_SETTINGS.autosaveEveryMs;
}

function resolvePersistedPalette(palette: unknown, theme: unknown): UIPalette {
  const mapped =
    typeof palette === "string" ? (LEGACY_PALETTE_IDS[palette] ?? palette) : "default";
  const id = isUIPalette(mapped) ? mapped : "default";
  if (theme === "light") return paletteForLegacyLightTheme(id);
  return id;
}

export function normalizeUISettings(
  raw?: Partial<UISettings> & { theme?: string; palette?: string; autosaveDelayMs?: number }
): UISettings {
  const { theme, palette, autosaveDelayMs, ...rest } = raw ?? {};
  const legacy = { ...rest, autosaveDelayMs };
  return {
    ...DEFAULT_UI_SETTINGS,
    ...rest,
    palette: resolvePersistedPalette(palette, theme),
    density:
      rest.density === "dense" || rest.density === "compact" || rest.density === "comfortable"
        ? rest.density
        : DEFAULT_UI_SETTINGS.density,
    motion:
      rest.motion === "full" || rest.motion === "reduced" || rest.motion === "system"
        ? rest.motion
        : DEFAULT_UI_SETTINGS.motion,
    diceAnimations: rest.diceAnimations ?? DEFAULT_UI_SETTINGS.diceAnimations,
    weatherEffects: rest.weatherEffects ?? DEFAULT_UI_SETTINGS.weatherEffects,
    lightingEffects: rest.lightingEffects ?? DEFAULT_UI_SETTINGS.lightingEffects,
    gridSize: normalizeGridSize(rest.gridSize ?? DEFAULT_GRID_SIZE),
    gridOpacity: normalizeGridOpacity(rest.gridOpacity ?? DEFAULT_GRID_OPACITY),
    snapToGrid: rest.snapToGrid ?? DEFAULT_UI_SETTINGS.snapToGrid,
    confirmDeletes: rest.confirmDeletes ?? DEFAULT_UI_SETTINGS.confirmDeletes,
    masterMuted: rest.masterMuted ?? DEFAULT_UI_SETTINGS.masterMuted,
    masterVolume: Math.max(
      0,
      Math.min(100, Math.round(rest.masterVolume ?? DEFAULT_UI_SETTINGS.masterVolume))
    ),
    musicVolume: Math.max(
      0,
      Math.min(100, Math.round(rest.musicVolume ?? DEFAULT_UI_SETTINGS.musicVolume))
    ),
    ambienceVolume: Math.max(
      0,
      Math.min(100, Math.round(rest.ambienceVolume ?? DEFAULT_UI_SETTINGS.ambienceVolume))
    ),
    sfxVolume: Math.max(
      0,
      Math.min(100, Math.round(rest.sfxVolume ?? DEFAULT_UI_SETTINGS.sfxVolume))
    ),
    autosaveEveryMs: normalizeAutosaveEveryMs(legacy),
    maxConsoleEntries: Math.max(
      100,
      Math.min(
        20000,
        Math.round(rest.maxConsoleEntries ?? DEFAULT_UI_SETTINGS.maxConsoleEntries)
      )
    ),
  };
}

export const DEFAULT_ABILITIES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const PC_COLORS = [
  "#747d9f",
  "#68758a",
  "#777391",
  "#637c79",
  "#765462",
  "#6f7485",
  "#7b687f",
  "#78808f",
];

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : String(mod);
}
