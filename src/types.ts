export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

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

export const CREATURE_TYPES = [
  "humanoid",
  "beast",
  "undead",
  "construct",
  "dragon",
  "elemental",
  "fey",
  "fiend",
  "giant",
  "monstrosity",
  "ooze",
  "plant",
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
  | "action"
  | "trait";

export interface RuleChoiceDefinition {
  id: string;
  label: string;
  target: RuleChoiceTarget;
  count: number;
  options: string[];
  bonus?: number;
  allowCustom?: boolean;
}

export interface RuleFeature {
  level: number;
  name: string;
  /** Compact mechanical wording, intended for both the UI and AI context. */
  effect: string;
}

export interface RuleDefinition {
  id: string;
  kind: RuleKind;
  name: string;
  parentId?: string;
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
  creatureType: CreatureType;
  size: CreatureSize;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  abilities: AbilityScores;
  skills: Skill[];
  traits: Trait[];
  features: Trait[];
  inventory: Item[];
  wallet: Wallet;
  statuses: StatusEffect[];
}

export interface PC extends CreatureMechanics {
  id: string;
  name: string;
  alignment: string;
  personality: string;
  color: string;
  /** Optional token art (data URL), e.g. a 2-Minute Tabletop token. */
  image?: string;
  /** Face portrait, separate from the map token. */
  portrait?: string;
  width: number;
  height: number;
  bounds: TokenCell[];
  x: number;
  y: number;
}

export type TokenKind = "enemy" | "npc" | "object";

export interface TokenCell {
  x: number;
  y: number;
}

export interface MapToken extends CreatureMechanics {
  id: string;
  blueprintId?: string;
  kind: TokenKind;
  /** The base type PCs should understand, such as "Dog" or "Chair". */
  name: string;
  /** Optional proper name, rendered alongside the base type. */
  givenName: string;
  color: string;
  image?: string;
  portrait?: string;
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
  name: string;
  color: string;
  image?: string;
  portrait?: string;
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

export interface CalculatedCreatureStats {
  maxHp: number;
  armorClass: number;
  proficiencyBonus: number;
  speed: number;
  saveDc: number;
  savingThrows: Partial<Record<keyof AbilityScores, number>>;
  proficiencies: string[];
  senses: string[];
  languages: string[];
  vulnerabilities: string[];
  resistances: string[];
  damageImmunities: string[];
  conditionImmunities: string[];
  skillBonuses: string[];
  specialActions: string[];
}

export function activeCreatureRules(
  creature: CreatureMechanics,
  rules: RuleDefinition[]
): RuleDefinition[] {
  return [
    creature.raceId,
    creature.subraceId,
    creature.classId,
    creature.subclassId,
    creature.backgroundId,
  ]
    .map((id) => rules.find((rule) => rule.id === id))
    .filter((rule): rule is RuleDefinition => Boolean(rule));
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
      .filter((choice) => choice.target === target)
      .flatMap((choice) =>
        (creature.ruleChoices?.[`${rule.id}:${choice.id}`] ?? [])
          .slice(0, choice.count)
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
    actions.push(
      `Unarmed Strike: melee attack; ${Math.max(0, 1 + strengthMod)} bludgeoning damage.`
    );
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

export function calculateCreatureStats(
  creature: CreatureMechanics,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): CalculatedCreatureStats {
  const activeRules = activeCreatureRules(creature, rules);
  const chosenAbilityBonuses = selectedRuleChoiceValues(creature, activeRules, "ability");
  const ability = (key: keyof AbilityScores) =>
    creature.abilities[key] +
    activeRules.reduce((sum, rule) => sum + (rule.abilityBonuses[key] ?? 0), 0) +
    chosenAbilityBonuses
      .filter(({ value }) => value === key)
      .reduce((sum, choice) => sum + choice.bonus, 0);
  const proficiencyBonus = 2 + Math.floor((Math.max(1, creature.level) - 1) / 4);
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
  const level = Math.max(1, creature.level);
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
  const equippedWeapons = equipped.filter((item) => item.category === "weapon");

  return {
    maxHp: calculatedHp,
    armorClass,
    proficiencyBonus,
    speed,
    saveDc: 8 + proficiencyBonus + mentalModifier,
    savingThrows,
    proficiencies: unique([
      ...activeRules.flatMap((rule) => rule.proficiencies),
      ...chosenProficiencies,
    ]),
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
  };
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
  "daylight",
  "overcast",
  "dusk",
  "night",
  "torchlit",
  "magical",
] as const;
export type EnvironmentLighting = (typeof ENVIRONMENT_LIGHTING)[number];

export const ENVIRONMENT_LIGHTING_LABELS: Record<EnvironmentLighting, string> = {
  daylight: "Daylight",
  overcast: "Overcast",
  dusk: "Dusk",
  night: "Night",
  torchlit: "Torchlit",
  magical: "Magical",
};

export interface Environment {
  id: string;
  name: string;
  notes: string;
  lighting: EnvironmentLighting;
  background: MapBackground | null;
  tokens: MapToken[];
}

export interface MapCamera {
  x: number;
  y: number;
  zoom: number;
}

export const GRID_SIZE_MIN = 24;
export const GRID_SIZE_MAX = 96;
export const GRID_SIZE_STEP = 8;
export const DEFAULT_GRID_SIZE = 48;
export const DEFAULT_GRID_OPACITY = 12;

export function normalizeGridSize(value: number): number {
  const snapped = Math.round(value / GRID_SIZE_STEP) * GRID_SIZE_STEP;
  return Math.max(GRID_SIZE_MIN, Math.min(GRID_SIZE_MAX, snapped));
}

export function normalizeGridOpacity(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const DICE_LOOKS = ["default", "monotone", "glossy", "glass"] as const;
export type DiceLook = (typeof DICE_LOOKS)[number];

export const DICE_LOOK_LABELS: Record<DiceLook, string> = {
  default: "Real",
  monotone: "Monotone",
  glossy: "Glossy",
  glass: "Glass",
};

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
  contextWindow: 40,
  reasoningEffort: "medium",
  extraInstructions: "",
  azureDeployment: "",
  azureApiVersion: "2024-10-21",
  savedKeys: {},
  savedModels: {},
  savedBaseUrls: {},
};

export const UI_PALETTES = [
  "default",
  "high-contrast",
  "pitch-black",
  "pearl-white",
  "nebula",
  "molten",
  "obsidian",
  "ice",
  "stone",
  "90s",
  "console",
] as const;

export type UIPalette = (typeof UI_PALETTES)[number];
export type UITheme = "system" | "dark" | "light";
export type UITextScale = "default" | "large" | "largest";
export type UIDensity = "compact" | "comfortable";
export type UIMotion = "system" | "reduced";
export type UITimeFormat = "system" | "12-hour" | "24-hour";

export interface UISettings {
  theme: UITheme;
  palette: UIPalette;
  textScale: UITextScale;
  density: UIDensity;
  motion: UIMotion;
  reducedTransparency: boolean;
  increasedContrast: boolean;
  enhancedFocus: boolean;
  autoScrollConsole: boolean;
  showDiceDetails: boolean;
  timeFormat: UITimeFormat;
  confirmClearConsole: boolean;
  gridSize: number;
  gridOpacity: number;
  diceLook: DiceLook;
}

export const DEFAULT_UI_SETTINGS: UISettings = {
  theme: "system",
  palette: "default",
  textScale: "default",
  density: "compact",
  motion: "system",
  reducedTransparency: false,
  increasedContrast: false,
  enhancedFocus: false,
  autoScrollConsole: true,
  showDiceDetails: true,
  timeFormat: "system",
  confirmClearConsole: true,
  gridSize: DEFAULT_GRID_SIZE,
  gridOpacity: DEFAULT_GRID_OPACITY,
  diceLook: "default",
};

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
