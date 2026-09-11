import type {
  AbilityScores,
  RuleChoiceDefinition,
  RuleDefinition,
  RuleFeature,
  RuleFeatureGrants,
  RuleKind,
  RuleResourceTrack,
  RuleSpellcasting,
  StartingKitItem,
} from "./types";

const f = (
  level: number,
  name: string,
  effect: string,
  grants?: RuleFeatureGrants
): RuleFeature => ({
  level,
  name,
  effect,
  ...(grants ? { grants } : {}),
});

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

const races: RuleDefinition[] = [
  rule("race-human", "race", "Human", {
    abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
    speed: 30,
    creatureSize: "medium",
    creatureType: "humanoid",
    languages: ["One chosen language"],
    sourcePage: 29,
    notes: "Standard human: +1 to every ability score.",
  }),
  rule("race-dwarf", "race", "Dwarf", {
    abilityBonuses: { con: 2 },
    speed: 25,
    creatureSize: "medium",
    creatureType: "humanoid",
    senses: ["Darkvision 60 ft."],
    languages: ["Dwarvish"],
    resistances: ["Poison"],
    proficiencies: [
      "Battleaxe",
      "Handaxe",
      "Light hammer",
      "Warhammer",
      "Choose smith's, brewer's, or mason's tools",
    ],
    sourcePage: 18,
    features: [
      f(1, "Dwarven Resilience", "Advantage on saves against poison; poison resistance."),
      f(
        1,
        "Stonecunning",
        "Double proficiency on History checks about stonework.",
        { expertise: ["History"] }
      ),
    ],
  }),
  rule("race-elf", "race", "Elf", {
    abilityBonuses: { dex: 2 },
    speed: 30,
    creatureSize: "medium",
    creatureType: "humanoid",
    senses: ["Darkvision 60 ft."],
    languages: ["Elvish"],
    proficiencies: ["Perception skill"],
    sourcePage: 21,
    features: [
      f(1, "Fey Ancestry", "Advantage vs charmed; magic cannot put you to sleep."),
      f(1, "Trance", "Four hours of meditation grants a full rest."),
    ],
  }),
  rule("race-halfling", "race", "Halfling", {
    abilityBonuses: { dex: 2 },
    speed: 25,
    creatureSize: "small",
    creatureType: "humanoid",
    languages: ["Halfling"],
    sourcePage: 26,
    features: [
      f(1, "Lucky", "Reroll a natural 1 on an attack, check, or save."),
      f(1, "Brave", "Advantage on saves against frightened."),
      f(1, "Halfling Nimbleness", "Move through spaces of creatures larger than you."),
    ],
  }),
  rule("race-dragonborn", "race", "Dragonborn", {
    abilityBonuses: { str: 2, cha: 1 },
    speed: 30,
    creatureSize: "medium",
    creatureType: "humanoid",
    languages: ["Draconic"],
    sourcePage: 32,
    features: [
      f(1, "Draconic Ancestry", "Choose acid, cold, fire, lightning, or poison ancestry."),
      f(1, "Breath Weapon (2d6)", "Action: ancestry-shaped 2d6 damage, save for half; recharges on rest."),
      f(6, "Breath Weapon (3d6)", "Breath Weapon damage increases to 3d6."),
      f(11, "Breath Weapon (4d6)", "Breath Weapon damage increases to 4d6."),
      f(16, "Breath Weapon (5d6)", "Breath Weapon damage increases to 5d6."),
      f(1, "Damage Resistance", "Resist the damage type of your draconic ancestry."),
    ],
  }),
  rule("race-gnome", "race", "Gnome", {
    abilityBonuses: { int: 2 },
    speed: 25,
    creatureSize: "small",
    creatureType: "humanoid",
    senses: ["Darkvision 60 ft."],
    languages: ["Gnomish"],
    sourcePage: 35,
    features: [f(1, "Gnome Cunning", "Advantage on INT, WIS, and CHA saves against magic.")],
  }),
  rule("race-half-elf", "race", "Half-Elf", {
    abilityBonuses: { cha: 2 },
    speed: 30,
    creatureSize: "medium",
    creatureType: "humanoid",
    senses: ["Darkvision 60 ft."],
    languages: ["Elvish", "One chosen language"],
    proficiencies: ["Two chosen skills", "Two chosen abilities gain +1"],
    sourcePage: 38,
    features: [f(1, "Fey Ancestry", "Advantage vs charmed; magic cannot put you to sleep.")],
  }),
  rule("race-half-orc", "race", "Half-Orc", {
    abilityBonuses: { str: 2, con: 1 },
    speed: 30,
    creatureSize: "medium",
    creatureType: "humanoid",
    senses: ["Darkvision 60 ft."],
    languages: ["Orc"],
    proficiencies: ["Intimidation skill"],
    sourcePage: 40,
    features: [
      f(1, "Relentless Endurance", "Drop to 1 HP instead of 0 once per long rest."),
      f(1, "Savage Attacks", "Critical melee hits roll one extra weapon damage die."),
    ],
  }),
  rule("race-tiefling", "race", "Tiefling", {
    abilityBonuses: { int: 1, cha: 2 },
    speed: 30,
    creatureSize: "medium",
    creatureType: "humanoid",
    senses: ["Darkvision 60 ft."],
    languages: ["Infernal"],
    resistances: ["Fire"],
    sourcePage: 42,
    features: [
      f(1, "Infernal Legacy: Thaumaturgy", "Know the thaumaturgy cantrip; Charisma is the casting ability."),
      f(3, "Infernal Legacy: Hellish Rebuke", "Cast hellish rebuke as a 2nd-level spell once per long rest."),
      f(5, "Infernal Legacy: Darkness", "Cast darkness once per long rest."),
    ],
  }),
];

const subraces: RuleDefinition[] = [
  rule("subrace-hill-dwarf", "subrace", "Hill Dwarf", {
    parentId: "race-dwarf",
    abilityBonuses: { wis: 1 },
    extraHp: 1,
    sourcePage: 20,
    features: [f(1, "Dwarven Toughness", "Maximum HP increases by 1 each level.")],
  }),
  rule("subrace-mountain-dwarf", "subrace", "Mountain Dwarf", {
    parentId: "race-dwarf",
    abilityBonuses: { str: 2 },
    proficiencies: ["Light armor", "Medium armor"],
    sourcePage: 20,
  }),
  rule("subrace-high-elf", "subrace", "High Elf", {
    parentId: "race-elf",
    abilityBonuses: { int: 1 },
    proficiencies: ["Longsword", "Shortsword", "Shortbow", "Longbow", "One wizard cantrip"],
    languages: ["One chosen language"],
    sourcePage: 23,
  }),
  rule("subrace-wood-elf", "subrace", "Wood Elf", {
    parentId: "race-elf",
    abilityBonuses: { wis: 1 },
    speed: 35,
    proficiencies: ["Longsword", "Shortsword", "Shortbow", "Longbow"],
    sourcePage: 24,
    features: [f(1, "Mask of the Wild", "May hide when lightly obscured by nature.")],
  }),
  rule("subrace-drow", "subrace", "Dark Elf (Drow)", {
    parentId: "race-elf",
    abilityBonuses: { cha: 1 },
    senses: ["Superior darkvision 120 ft."],
    proficiencies: ["Rapier", "Shortsword", "Hand crossbow"],
    sourcePage: 24,
    features: [
      f(1, "Sunlight Sensitivity", "Disadvantage on sight-based attacks and Perception in direct sun."),
      f(1, "Drow Magic: Dancing Lights", "Know the dancing lights cantrip; Charisma is the casting ability."),
      f(3, "Drow Magic: Faerie Fire", "Cast faerie fire once per long rest."),
      f(5, "Drow Magic: Darkness", "Cast darkness once per long rest."),
    ],
  }),
  rule("subrace-lightfoot", "subrace", "Lightfoot Halfling", {
    parentId: "race-halfling",
    abilityBonuses: { cha: 1 },
    sourcePage: 28,
    features: [f(1, "Naturally Stealthy", "May hide behind a creature at least one size larger.")],
  }),
  rule("subrace-stout", "subrace", "Stout Halfling", {
    parentId: "race-halfling",
    abilityBonuses: { con: 1 },
    resistances: ["Poison"],
    sourcePage: 28,
    features: [f(1, "Stout Resilience", "Advantage on saves against poison; poison resistance.")],
  }),
  rule("subrace-forest-gnome", "subrace", "Forest Gnome", {
    parentId: "race-gnome",
    abilityBonuses: { dex: 1 },
    sourcePage: 37,
    features: [
      f(1, "Natural Illusionist", "Know minor illusion; Intelligence is the casting ability."),
      f(1, "Speak with Small Beasts", "Communicate simple ideas to Small or smaller beasts."),
    ],
  }),
  rule("subrace-rock-gnome", "subrace", "Rock Gnome", {
    parentId: "race-gnome",
    abilityBonuses: { con: 1 },
    proficiencies: ["Tinker's tools"],
    sourcePage: 37,
    features: [
      f(1, "Artificer's Lore", "Double proficiency on History about magic, alchemy, or technology."),
      f(1, "Tinker", "Build up to three Tiny clockwork devices with time and materials."),
    ],
  }),
  rule("subrace-variant-human", "subrace", "Variant Human", {
    parentId: "race-human",
    abilityBonuses: { str: -1, dex: -1, con: -1, int: -1, wis: -1, cha: -1 },
    proficiencies: ["One chosen skill", "Two chosen abilities gain +1"],
    sourcePage: 31,
    notes: "Optional variant replaces the standard human's six +1 bonuses.",
  }),
];

const kit = (
  ...entries: Array<string | readonly [string, number] | readonly [string, number, boolean]>
): StartingKitItem[] =>
  entries.map((entry) =>
    typeof entry === "string"
      ? { libraryItemId: `item-${entry}`, qty: 1 }
      : {
          libraryItemId: `item-${entry[0]}`,
          qty: entry[1],
          equipped: entry[2],
        }
  );

const FULL_CASTER_SLOTS = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

const HALF_CASTER_SLOTS = [
  [],
  [2],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2],
];

const THIRD_CASTER_SLOTS = [
  [],
  [],
  [2],
  [3],
  [3],
  [3],
  [4, 2],
  [4, 2],
  [4, 2],
  [4, 3],
  [4, 3],
  [4, 3],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 1],
];

const fullCasterSlots = (
  ability: keyof AbilityScores,
  cantripsKnown: number[],
  spellsKnown?: number[]
): RuleSpellcasting => ({
  mode: "standard",
  ability,
  slotsByLevel: FULL_CASTER_SLOTS,
  cantripsKnown,
  ...(spellsKnown ? { spellsKnown } : {}),
});

const halfCasterSlots = (
  ability: keyof AbilityScores,
  spellsKnown?: number[]
): RuleSpellcasting => ({
  mode: "standard",
  ability,
  slotsByLevel: HALF_CASTER_SLOTS,
  ...(spellsKnown ? { spellsKnown } : {}),
});

const thirdCasterSlots = (
  ability: keyof AbilityScores,
  cantripsKnown: number[],
  spellsKnown: number[]
): RuleSpellcasting => ({
  mode: "standard",
  ability,
  slotsByLevel: THIRD_CASTER_SLOTS,
  cantripsKnown,
  spellsKnown,
});

const warlockPactSlots = (): RuleSpellcasting => ({
  mode: "pact",
  ability: "cha",
  slotsByLevel: [
    [1], [2], [2], [2], [2], [2], [2], [2], [2], [2],
    [3], [3], [3], [3], [3], [3], [4], [4], [4], [4],
  ],
  slotLevels: [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
  cantripsKnown: [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
  spellsKnown: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
});

const track = (
  id: string,
  name: string,
  unit: string,
  values: Array<readonly [number, number | string]>
): RuleResourceTrack => ({
  id,
  name,
  unit,
  values: values.map(([level, value]) => ({ level, value })),
});

const perLevelTrack = (
  id: string,
  name: string,
  unit: string,
  startLevel: number,
  valueAtLevel: (level: number) => number | string
): RuleResourceTrack =>
  track(
    id,
    name,
    unit,
    Array.from({ length: 21 - startLevel }, (_, index) => {
      const level = startLevel + index;
      return [level, valueAtLevel(level)] as const;
    })
  );

const BARD_CANTRIPS = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const BARD_SPELLS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 15, 16, 18, 19, 19, 20, 22, 22, 22];
const CLERIC_CANTRIPS = [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6];
const DRUID_CANTRIPS = [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4];
const SORCERER_CANTRIPS = [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6];
const SORCERER_SPELLS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 12, 13, 13, 14, 14, 15, 15, 15, 15];
const WIZARD_CANTRIPS = [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
const RANGER_SPELLS = [0, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11];

const CLASS_PROGRESSION: Record<
  string,
  { spellcasting: RuleSpellcasting | null; resourceTracks: RuleResourceTrack[] }
> = {
  barbarian: {
    spellcasting: null,
    resourceTracks: [
      track("rage-uses", "Rage uses", "uses", [[1, 2], [3, 3], [6, 4], [12, 5], [17, 6], [20, "Unlimited"]]),
      track("rage-damage", "Rage damage", "bonus damage", [[1, 2], [9, 3], [16, 4]]),
      track("extra-attack", "Attacks per Attack action", "attacks", [[1, 1], [5, 2]]),
    ],
  },
  bard: {
    spellcasting: fullCasterSlots("cha", BARD_CANTRIPS, BARD_SPELLS),
    resourceTracks: [
      track("bardic-inspiration-die", "Bardic Inspiration die", "die", [[1, "d6"], [5, "d8"], [10, "d10"], [15, "d12"]]),
    ],
  },
  cleric: {
    spellcasting: fullCasterSlots("wis", CLERIC_CANTRIPS),
    resourceTracks: [
      track("channel-divinity", "Channel Divinity uses", "uses", [[2, 1], [6, 2], [18, 3]]),
    ],
  },
  druid: {
    spellcasting: fullCasterSlots("wis", DRUID_CANTRIPS),
    resourceTracks: [track("wild-shape", "Wild Shape uses", "uses", [[2, 2]])],
  },
  fighter: {
    spellcasting: null,
    resourceTracks: [
      track("second-wind", "Second Wind uses", "uses", [[1, 1]]),
      track("action-surge", "Action Surge uses", "uses", [[2, 1], [17, 2]]),
      track("extra-attack", "Attacks per Attack action", "attacks", [[1, 1], [5, 2], [11, 3], [20, 4]]),
      track("indomitable", "Indomitable uses", "uses", [[9, 1], [13, 2], [17, 3]]),
    ],
  },
  monk: {
    spellcasting: null,
    resourceTracks: [
      perLevelTrack("ki", "Ki points", "points", 2, (level) => level),
      track("martial-arts-die", "Martial Arts die", "die", [[1, "d4"], [5, "d6"], [11, "d8"], [17, "d10"]]),
      track("extra-attack", "Attacks per Attack action", "attacks", [[1, 1], [5, 2]]),
    ],
  },
  paladin: {
    spellcasting: halfCasterSlots("cha"),
    resourceTracks: [
      perLevelTrack("lay-on-hands", "Lay on Hands pool", "hit points", 1, (level) => level * 5),
      track("channel-divinity", "Channel Divinity uses", "uses", [[3, 1]]),
      track("extra-attack", "Attacks per Attack action", "attacks", [[1, 1], [5, 2]]),
    ],
  },
  ranger: {
    spellcasting: halfCasterSlots("wis", RANGER_SPELLS),
    resourceTracks: [
      track("extra-attack", "Attacks per Attack action", "attacks", [[1, 1], [5, 2]]),
    ],
  },
  rogue: {
    spellcasting: null,
    resourceTracks: [
      perLevelTrack("sneak-attack", "Sneak Attack", "d6", 1, (level) => Math.ceil(level / 2)),
    ],
  },
  sorcerer: {
    spellcasting: fullCasterSlots("cha", SORCERER_CANTRIPS, SORCERER_SPELLS),
    resourceTracks: [
      perLevelTrack("sorcery-points", "Sorcery points", "points", 2, (level) => level),
    ],
  },
  warlock: {
    spellcasting: warlockPactSlots(),
    resourceTracks: [
      track("invocations-known", "Eldritch Invocations known", "invocations", [[2, 2], [5, 3], [7, 4], [9, 5], [12, 6], [15, 7], [18, 8]]),
    ],
  },
  wizard: {
    spellcasting: fullCasterSlots("int", WIZARD_CANTRIPS),
    resourceTracks: [],
  },
};

const STANDARD_ASI_LEVELS = [4, 8, 12, 16, 19];

const classSeed = (
  id: string,
  name: string,
  hitDie: number,
  saves: RuleDefinition["saveProficiencies"],
  proficiencies: string[],
  sourcePage: number,
  features: RuleFeature[],
  startingKit: StartingKitItem[],
  unarmoredAcAbilities: RuleDefinition["unarmoredAcAbilities"] = []
) =>
  rule(`class-${id}`, "class", name, {
    abilityScoreImprovementLevels:
      id === "fighter"
        ? [4, 6, 8, 12, 14, 16, 19]
        : id === "rogue"
          ? [4, 8, 10, 12, 16, 19]
          : STANDARD_ASI_LEVELS,
    spellcasting: CLASS_PROGRESSION[id]?.spellcasting ?? null,
    resourceTracks: CLASS_PROGRESSION[id]?.resourceTracks ?? [],
    hitDie,
    saveProficiencies: saves,
    proficiencies,
    sourcePage,
    features,
    startingKit,
    unarmoredAcAbilities,
  });

const classes: RuleDefinition[] = [
  classSeed("barbarian", "Barbarian", 12, ["str", "con"], ["Light armor", "Medium armor", "Shields", "Simple weapons", "Martial weapons", "Choose two class skills"], 46, [
    f(1, "Rage", "Bonus action; STR melee bonus damage, physical resistance, STR advantage; uses scale."),
    f(1, "Unarmored Defense", "Without armor, AC = 10 + DEX mod + CON mod; shield allowed."),
    f(2, "Reckless Attack", "Gain STR-melee advantage this turn; attacks against you gain advantage."),
    f(2, "Danger Sense", "Advantage on visible DEX saves."),
    f(5, "Extra Attack", "Attack twice with the Attack action."),
    f(5, "Fast Movement", "+10 ft. speed while not wearing heavy armor."),
    f(11, "Relentless Rage", "While raging, CON save to drop to 1 HP instead of 0."),
    f(20, "Primal Champion", "+4 STR and CON; maximums become 24."),
  ], kit(["greataxe", 1, true], ["handaxe", 2], "explorers-pack", ["javelin", 4]), ["dex", "con"]),
  classSeed("bard", "Bard", 8, ["dex", "cha"], ["Light armor", "Simple weapons", "Hand crossbow", "Longsword", "Rapier", "Shortsword", "Three musical instruments", "Choose three skills"], 51, [
    f(1, "Spellcasting", "Known Charisma spellcasting."),
    f(1, "Bardic Inspiration", "Bonus action grants a level-scaled die to an ally's roll."),
    f(
      2,
      "Jack of All Trades",
      "Add half proficiency to unproficient ability checks.",
      { halfProficiencyAbilities: ["str", "dex", "con", "int", "wis", "cha"] }
    ),
    f(2, "Song of Rest", "Allies regain extra HP on short rests."),
    f(3, "Expertise", "Double proficiency for two skills; two more at 10th."),
    f(10, "Magical Secrets", "Learn spells from any class; more at 14th and 18th."),
  ], kit(["rapier", 1, true], "diplomats-pack", "lute", ["leather-armor", 1, true], "dagger")),
  classSeed("cleric", "Cleric", 8, ["wis", "cha"], ["Light armor", "Medium armor", "Shields", "Simple weapons", "Choose two class skills"], 56, [
    f(1, "Spellcasting", "Prepared Wisdom divine spellcasting."),
    f(1, "Divine Domain", "Domain grants spells and features."),
    f(2, "Channel Divinity", "Use Turn Undead or a domain option; uses scale."),
    f(10, "Divine Intervention", "Percentile request for deity aid; automatic at 20th."),
  ], kit(["mace", 1, true], ["scale-mail", 1, true], ["light-crossbow", 1, true], "crossbow-bolts-20", "priests-pack", ["shield", 1, true], "holy-symbol-amulet")),
  classSeed("druid", "Druid", 8, ["int", "wis"], ["Light armor", "Medium armor", "Shields (nonmetal)", "Druid weapons", "Herbalism kit", "Choose two class skills"], 64, [
    f(1, "Spellcasting", "Prepared Wisdom primal spellcasting."),
    f(2, "Wild Shape", "Transform into a known beast; limits improve with level."),
    f(18, "Beast Spells", "Cast many druid spells while Wild Shaped."),
    f(20, "Archdruid", "Unlimited Wild Shape; ignore many spell components."),
  ], kit(["shield", 1, true], ["scimitar", 1, true], ["leather-armor", 1, true], "explorers-pack", "druidic-focus-totem")),
  classSeed("fighter", "Fighter", 10, ["str", "con"], ["All armor", "Shields", "Simple weapons", "Martial weapons", "Choose two class skills"], 70, [
    f(1, "Fighting Style", "Choose one fighting specialty."),
    f(1, "Second Wind", "Bonus action: regain 1d10 + fighter level HP once per rest."),
    f(2, "Action Surge", "Take one additional action once per rest; two uses at 17th."),
    f(5, "Extra Attack", "Attack twice; three times at 11th; four times at 20th."),
    f(9, "Indomitable", "Reroll a failed save; more uses at 13th and 17th."),
  ], kit(["chain-mail", 1, true], ["longsword", 1, true], ["shield", 1, true], "light-crossbow", "crossbow-bolts-20", "dungeoneers-pack")),
  classSeed("monk", "Monk", 8, ["str", "dex"], ["Simple weapons", "Shortsword", "One tool or instrument", "Choose two class skills"], 76, [
    f(1, "Unarmored Defense", "Without armor/shield, AC = 10 + DEX mod + WIS mod."),
    f(1, "Martial Arts", "DEX-compatible monk weapons/unarmed strikes and bonus unarmed strike."),
    f(2, "Ki", "Spend level-scaled points on monk techniques."),
    f(2, "Unarmored Movement", "Speed bonus without armor/shield; scales."),
    f(5, "Extra Attack", "Attack twice with the Attack action."),
    f(5, "Stunning Strike", "Spend 1 ki on a hit; CON save or stunned."),
    f(14, "Diamond Soul", "Proficient in all saves; spend ki to reroll a failed save."),
  ], kit(["shortsword", 1, true], "dungeoneers-pack", ["dart", 10]), ["dex", "wis"]),
  classSeed("paladin", "Paladin", 10, ["wis", "cha"], ["All armor", "Shields", "Simple weapons", "Martial weapons", "Choose two class skills"], 82, [
    f(1, "Divine Sense", "Detect celestials, fiends, undead, and consecration nearby."),
    f(1, "Lay on Hands", "Healing pool equals five times paladin level."),
    f(2, "Spellcasting", "Prepared Charisma divine spellcasting."),
    f(2, "Divine Smite", "Spend a slot on a melee hit for radiant damage."),
    f(5, "Extra Attack", "Attack twice with the Attack action."),
    f(6, "Aura of Protection", "Nearby allies add your CHA mod to saves."),
  ], kit(["chain-mail", 1, true], ["longsword", 1, true], ["shield", 1, true], ["javelin", 5], "priests-pack", "holy-symbol-amulet")),
  classSeed("ranger", "Ranger", 10, ["str", "dex"], ["Light armor", "Medium armor", "Shields", "Simple weapons", "Martial weapons", "Choose three class skills"], 89, [
    f(1, "Favored Enemy", "Tracking/knowledge benefits against chosen creature types."),
    f(1, "Natural Explorer", "Expert travel benefits in chosen terrains."),
    f(2, "Spellcasting", "Known Wisdom primal spellcasting."),
    f(5, "Extra Attack", "Attack twice with the Attack action."),
    f(14, "Vanish", "Hide as a bonus action; optionally cannot be tracked nonmagically."),
  ], kit(["scale-mail", 1, true], ["shortsword", 2, true], "dungeoneers-pack", ["longbow", 1, true], "arrows-20")),
  classSeed("rogue", "Rogue", 8, ["dex", "int"], ["Light armor", "Simple weapons", "Hand crossbow", "Longsword", "Rapier", "Shortsword", "Thieves' tools", "Choose four class skills"], 94, [
    f(1, "Expertise", "Double proficiency for two proficiencies; two more at 6th."),
    f(1, "Sneak Attack", "Once per turn, deal level-scaled extra damage when qualified."),
    f(2, "Cunning Action", "Bonus action Dash, Disengage, or Hide."),
    f(5, "Uncanny Dodge", "Reaction halves one visible attack's damage."),
    f(7, "Evasion", "DEX save: no damage on success, half on failure."),
    f(11, "Reliable Talent", "Treat proficient ability-check d20 rolls below 10 as 10."),
  ], kit(["rapier", 1, true], "shortbow", "arrows-20", "burglars-pack", ["leather-armor", 1, true], ["dagger", 2], "thieves-tools")),
  classSeed("sorcerer", "Sorcerer", 6, ["con", "cha"], ["Dagger", "Dart", "Sling", "Quarterstaff", "Light crossbow", "Choose two class skills"], 99, [
    f(1, "Spellcasting", "Known Charisma arcane spellcasting."),
    f(2, "Font of Magic", "Sorcery points convert to/from slots and power features."),
    f(3, "Metamagic", "Choose ways to modify spells; gain more options by level."),
  ], kit("light-crossbow", "crossbow-bolts-20", "component-pouch", "dungeoneers-pack", ["dagger", 2])),
  classSeed("warlock", "Warlock", 8, ["wis", "cha"], ["Light armor", "Simple weapons", "Choose two class skills"], 105, [
    f(1, "Pact Magic", "Known Charisma spells; pact slots refresh on short or long rest."),
    f(2, "Eldritch Invocations", "Choose persistent magical abilities; count scales."),
    f(3, "Pact Boon", "Choose Chain, Blade, or Tome."),
    f(11, "Mystic Arcanum", "One daily 6th-level spell; 7th-9th options arrive later."),
  ], kit("light-crossbow", "crossbow-bolts-20", "component-pouch", "dungeoneers-pack", ["leather-armor", 1, true], "club", ["dagger", 2])),
  classSeed("wizard", "Wizard", 6, ["int", "wis"], ["Dagger", "Dart", "Sling", "Quarterstaff", "Light crossbow", "Choose two class skills"], 112, [
    f(1, "Spellcasting", "Prepared Intelligence spellcasting using a spellbook."),
    f(1, "Arcane Recovery", "Once daily after a short rest, recover limited spell slots."),
    f(18, "Spell Mastery", "Cast one chosen 1st- and 2nd-level spell at will."),
    f(20, "Signature Spells", "Two chosen 3rd-level spells are always prepared and each free once per rest."),
  ], kit(["quarterstaff", 1, true], "component-pouch", "scholars-pack", "spellbook")),
];

const subclass = (
  id: string,
  name: string,
  parentId: string,
  sourcePage: number,
  features: RuleFeature[],
  proficiencies: string[] = [],
  patch: Partial<RuleDefinition> = {}
) =>
  rule(`subclass-${id}`, "subclass", name, {
    parentId,
    minLevel:
      parentId === "class-cleric" ||
      parentId === "class-sorcerer" ||
      parentId === "class-warlock"
        ? 1
        : parentId === "class-druid" || parentId === "class-wizard"
          ? 2
          : 3,
    sourcePage,
    features,
    proficiencies,
    ...patch,
  });

const subclasses: RuleDefinition[] = [
  subclass("berserker", "Path of the Berserker", "class-barbarian", 49, [
    f(3, "Frenzy", "While raging, bonus melee attack; 1 exhaustion when the rage ends."),
    f(6, "Mindless Rage", "Can't be charmed or frightened while raging."),
    f(10, "Intimidating Presence", "Action: CHA save or frightened until your next turn."),
    f(14, "Retaliation", "Reaction melee attack when a nearby creature damages you."),
  ]),
  subclass("totem-warrior", "Path of the Totem Warrior", "class-barbarian", 50, [
    f(3, "Spirit Seeker", "Ritual beast sense and speak with animals."),
    f(3, "Totem Spirit", "Bear: resist all but psychic. Eagle: opportunity attacks hindered; Dash bonus. Wolf: allies gain melee advantage vs adjacent foes."),
    f(6, "Aspect of the Beast", "Choose a travel, carrying, or tracking spirit benefit."),
    f(10, "Spirit Walker", "Commune with nature as a ritual."),
    f(14, "Totemic Attunement", "Stronger bear/eagle/wolf combat auras while raging."),
  ]),
  subclass("lore", "College of Lore", "class-bard", 54, [
    f(3, "Bonus Proficiencies", "Three extra skills."),
    f(3, "Cutting Words", "Reaction spends inspiration to subtract the die from a nearby enemy roll."),
    f(6, "Additional Magical Secrets", "Learn two spells from any class."),
    f(14, "Peerless Skill", "Add inspiration to your own ability check."),
  ], ["Three chosen skills"]),
  subclass("valor", "College of Valor", "class-bard", 55, [
    f(3, "Bonus Proficiencies", "Medium armor, shields, martial weapons."),
    f(3, "Combat Inspiration", "Ally may add inspiration to a damage roll or AC against one attack."),
    f(6, "Extra Attack", "Attack twice with the Attack action."),
    f(14, "Battle Magic", "Bonus weapon attack after casting a bard spell."),
  ], ["Medium armor", "Shields", "Martial weapons"]),
  subclass("knowledge", "Knowledge Domain", "class-cleric", 59, [
    f(1, "Blessings of Knowledge", "Two languages; two of Arcana/History/Nature/Religion gain double proficiency."),
    f(2, "Knowledge of the Ages", "Channel: proficiency in one skill or tool for 10 minutes."),
    f(6, "Read Thoughts", "Channel: sense surface thoughts, then optionally cast suggestion."),
    f(8, "Potent Spellcasting", "Add WIS mod to cleric cantrip damage."),
    f(17, "Visions of the Past", "Meditate to learn an object's or area's recent history."),
  ]),
  subclass("life", "Life Domain", "class-cleric", 60, [
    f(1, "Disciple of Life", "1st+ healing spells restore extra 2 + spell level HP."),
    f(2, "Preserve Life", "Channel: distribute 5 x cleric level HP to nearby creatures, up to half each."),
    f(6, "Blessed Healer", "When you heal another with a 1st+ spell, you regain 2 + spell level HP."),
    f(8, "Divine Strike", "Once per turn, +1d8 radiant on a weapon hit; 2d8 at 14th."),
    f(17, "Supreme Healing", "Maximize dice on your cleric healing spells."),
  ], ["Heavy armor"]),
  subclass("light", "Light Domain", "class-cleric", 60, [
    f(1, "Warding Flare", "Reaction imposes disadvantage on one attack; uses = WIS mod / long rest."),
    f(2, "Radiance of the Dawn", "Channel: end magical darkness and deal radiant damage, DEX save for half."),
    f(6, "Improved Flare", "Warding Flare can protect another creature."),
    f(8, "Potent Spellcasting", "Add WIS mod to cleric cantrip damage."),
    f(17, "Corona of Light", "Aura of sunlight; enemies have disadvantage vs your fire/radiant spells."),
  ]),
  subclass("nature", "Nature Domain", "class-cleric", 61, [
    f(1, "Acolyte of Nature", "One druid cantrip and one of Animal Handling/Nature/Survival."),
    f(2, "Charm Animals and Plants", "Channel: WIS save or beasts/plants are charmed briefly."),
    f(6, "Dampen Elements", "Reaction grants resistance to one elemental damage instance."),
    f(8, "Divine Strike", "Once per turn, +1d8 cold/fire/lightning on a weapon hit; 2d8 at 14th."),
    f(17, "Master of Nature", "Charmed beasts and plants obey your commands."),
  ], ["Heavy armor"]),
  subclass("tempest", "Tempest Domain", "class-cleric", 62, [
    f(1, "Wrath of the Storm", "Reaction: lightning or thunder damage when hit in melee; WIS mod uses."),
    f(2, "Destructive Wrath", "Channel: maximize lightning or thunder damage."),
    f(6, "Thunderbolt Strike", "Large or smaller creatures you hit with lightning are pushed 10 ft."),
    f(8, "Divine Strike", "Once per turn, +1d8 thunder on a weapon hit; 2d8 at 14th."),
    f(17, "Stormborn", "Fly speed equal to walking speed outdoors."),
  ], ["Martial weapons", "Heavy armor"]),
  subclass("trickery", "Trickery Domain", "class-cleric", 62, [
    f(1, "Blessing of the Trickster", "Touch grants advantage on Stealth for 1 hour."),
    f(2, "Invoke Duplicity", "Channel: illusory double; spells can originate from it; advantage if both threaten."),
    f(6, "Cloak of Shadows", "Channel: become invisible until your next turn or until you attack/cast."),
    f(8, "Divine Strike", "Once per turn, +1d8 poison on a weapon hit; 2d8 at 14th."),
    f(17, "Improved Duplicity", "Four duplicates; teleport as a bonus action, swapping places."),
  ]),
  subclass("war", "War Domain", "class-cleric", 63, [
    f(1, "War Priest", "Bonus weapon attack; uses = WIS mod / long rest."),
    f(2, "Guided Strike", "Channel: +10 to one attack roll."),
    f(6, "War God's Blessing", "Reaction Channel: +10 to a nearby ally's attack."),
    f(8, "Divine Strike", "Once per turn, +1d8 weapon-type damage; 2d8 at 14th."),
    f(17, "Avatar of Battle", "Resistance to nonmagical bludgeoning, piercing, and slashing."),
  ], ["Martial weapons", "Heavy armor"]),
  subclass("land", "Circle of the Land", "class-druid", 68, [
    f(2, "Bonus Cantrip", "One extra druid cantrip."),
    f(2, "Natural Recovery", "Short rest: recover spell slots totaling half druid level (rounded up), 5th or lower."),
    f(3, "Circle Spells", "Always prepared terrain spells."),
    f(6, "Land's Stride", "Nonmagical difficult terrain costs no extra movement; advantage vs plant magic."),
    f(10, "Nature's Ward", "Immune to poison, disease, and charm/fear from elementals and fey."),
    f(14, "Nature's Sanctuary", "Beasts and plants must save to attack you."),
  ]),
  subclass("moon", "Circle of the Moon", "class-druid", 69, [
    f(2, "Combat Wild Shape", "Wild Shape as a bonus action; spend a slot to heal 1d8 per slot level."),
    f(2, "Circle Forms", "Stronger CR beast forms; CR scales at 6th."),
    f(6, "Primal Strike", "Beast attacks count as magical."),
    f(10, "Elemental Wild Shape", "Two uses to become an air, earth, fire, or water elemental."),
    f(14, "Thousand Forms", "Cast alter self at will."),
  ]),
  subclass("champion", "Champion", "class-fighter", 72, [
    f(3, "Improved Critical", "Critical hits on 19-20."),
    f(
      7,
      "Remarkable Athlete",
      "Add half proficiency to unproficient STR/DEX/CON checks; longer jumps.",
      { halfProficiencyAbilities: ["str", "dex", "con"] }
    ),
    f(10, "Additional Fighting Style", "Choose a second fighting style."),
    f(15, "Superior Critical", "Critical hits on 18-20."),
    f(18, "Survivor", "Regain 5 + CON mod HP at the start of your turn if below half HP."),
  ]),
  subclass("battle-master", "Battle Master", "class-fighter", 73, [
    f(3, "Combat Superiority", "Maneuvers powered by superiority dice; dice and options scale."),
    f(3, "Student of War", "One artisan's tool proficiency."),
    f(7, "Know Your Enemy", "Study a creature to learn how it compares to you."),
    f(10, "Improved Combat Superiority", "Superiority dice become d10, then d12 at 18th."),
    f(15, "Relentless", "Regain one superiority die if you start a fight with none."),
  ], [], {
    resourceTracks: [
      track("superiority-dice", "Superiority dice", "dice", [[3, 4], [7, 5], [15, 6]]),
      track("superiority-die", "Superiority die", "die", [[3, "d8"], [10, "d10"], [18, "d12"]]),
    ],
  }),
  subclass("eldritch-knight", "Eldritch Knight", "class-fighter", 74, [
    f(3, "Spellcasting", "Prepared wizard spells, mostly abjuration and evocation."),
    f(3, "Weapon Bond", "Can't be disarmed of a bonded weapon; summon it as a bonus action."),
    f(7, "War Magic", "Bonus weapon attack after a cantrip."),
    f(10, "Eldritch Strike", "A hit imposes disadvantage on the next save vs your spell before your next turn."),
    f(15, "Arcane Charge", "Teleport 30 ft. when you Action Surge."),
    f(18, "Improved War Magic", "Bonus weapon attack after any spell."),
  ], [], {
    spellcasting: thirdCasterSlots(
      "int",
      [0, 0, 2, 2, 2, 2, 2, 2, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
      [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13]
    ),
  }),
  subclass("open-hand", "Way of the Open Hand", "class-monk", 79, [
    f(3, "Open Hand Technique", "On Flurry of Blows hit: prone, push, or deny reactions."),
    f(6, "Wholeness of Body", "Action: regain 3 x monk level HP once per long rest."),
    f(11, "Tranquility", "Sanctuary effect after a long rest until you attack or cast."),
    f(17, "Quivering Palm", "Spend 3 ki; later action can force a CON save, 0 HP on failure or 10d10 on success."),
  ]),
  subclass("shadow", "Way of Shadow", "class-monk", 80, [
    f(3, "Shadow Arts", "Spend 2 ki to cast darkness, darkvision, pass without trace, or silence; minor illusion free."),
    f(6, "Shadow Step", "Bonus teleport 60 ft. between dim light or darkness; advantage on the next melee attack."),
    f(11, "Cloak of Shadows", "Become invisible in dim light or darkness until you attack or cast."),
    f(17, "Opportunist", "Reaction attack when a nearby creature is hit by someone else."),
  ]),
  subclass("four-elements", "Way of the Four Elements", "class-monk", 80, [
    f(3, "Disciple of the Elements", "Spend ki on elemental disciplines; learn more at 6th, 11th, and 17th."),
  ]),
  subclass("devotion", "Oath of Devotion", "class-paladin", 85, [
    f(3, "Sacred Weapon", "Channel: CHA mod to attacks with one weapon; it sheds light."),
    f(3, "Turn the Unholy", "Channel: turn fiends and undead."),
    f(7, "Aura of Devotion", "You and nearby allies can't be charmed."),
    f(15, "Purity of Spirit", "Continuous protection from evil and good."),
    f(20, "Holy Nimbus", "Aura of sunlight; nearby enemies take radiant damage; advantage vs fiend/undead spells."),
  ]),
  subclass("ancients", "Oath of the Ancients", "class-paladin", 86, [
    f(3, "Nature's Wrath", "Channel: restrain a creature with spectral vines."),
    f(3, "Turn the Faithless", "Channel: turn fey and fiends."),
    f(7, "Aura of Warding", "You and nearby allies resist spell damage."),
    f(15, "Undying Sentinel", "Drop to 1 HP instead of 0 once per long rest; aging slows."),
    f(20, "Elder Champion", "Tree-form aura: regen, 1-bonus-action spells, and save disadvantage for nearby enemies."),
  ]),
  subclass("vengeance", "Oath of Vengeance", "class-paladin", 87, [
    f(3, "Abjure Enemy", "Channel: frighten and halt a creature; fiends/undead have disadvantage."),
    f(3, "Vow of Enmity", "Channel: advantage on attacks vs one creature for 1 minute."),
    f(7, "Relentless Avenger", "Opportunity-attack hit lets you move at half speed without provoking."),
    f(15, "Soul of Vengeance", "Reaction attack when your sworn enemy attacks."),
    f(20, "Avenging Angel", "Wings, 60-ft fly, and a frightening aura."),
  ]),
  subclass("hunter", "Hunter", "class-ranger", 93, [
    f(3, "Hunter's Prey", "Choose Colossus Slayer, Giant Killer, or Horde Breaker."),
    f(7, "Defensive Tactics", "Choose Escape the Horde, Multiattack Defense, or Steel Will."),
    f(11, "Multiattack", "Choose Volley or Whirlwind Attack."),
    f(15, "Superior Hunter's Defense", "Choose Evasion, Stand Against the Tide, or Uncanny Dodge."),
  ]),
  subclass("beast-master", "Beast Master", "class-ranger", 93, [
    f(3, "Ranger's Companion", "A beast companion acts on your turn; it adds your proficiency to AC, attack, damage, saves, and skills."),
    f(7, "Exceptional Training", "Command a non-attack action as a bonus action; its attacks count as magical."),
    f(11, "Bestial Fury", "The companion can make two attacks."),
    f(15, "Share Spells", "Spells you cast on yourself can also affect your companion."),
  ]),
  subclass("thief", "Thief", "class-rogue", 97, [
    f(3, "Fast Hands", "Cunning Action can also Use an Object, disarm traps, pick locks, or pick pockets."),
    f(3, "Second-Story Work", "Climb at full speed; longer running jumps."),
    f(9, "Supreme Sneak", "Advantage on Stealth if you move no more than half speed."),
    f(13, "Use Magic Device", "Ignore class, race, and level requirements on magic items."),
    f(17, "Thief's Reflexes", "Two turns in the first round; the second is at initiative -10."),
  ]),
  subclass("assassin", "Assassin", "class-rogue", 97, [
    f(3, "Bonus Proficiencies", "Disguise kit and poisoner's kit."),
    f(3, "Assassinate", "Advantage vs creatures that haven't acted; crits on surprised hits."),
    f(9, "Infiltration Expertise", "Create a false identity with time and money."),
    f(13, "Impostor", "Unerringly mimic another person's speech, writing, and behavior after study."),
    f(17, "Death Strike", "Surprised hits force a CON save or double damage."),
  ], ["Disguise kit", "Poisoner's kit"]),
  subclass("arcane-trickster", "Arcane Trickster", "class-rogue", 97, [
    f(3, "Spellcasting", "Known wizard spells, mostly enchantment and illusion, plus mage hand."),
    f(3, "Mage Hand Legerdemain", "Invisible mage hand; stow, retrieve, pick pockets, or use thieves' tools at range."),
    f(9, "Magical Ambush", "Creatures have disadvantage on saves vs your spells if you are hidden."),
    f(13, "Versatile Trickster", "Bonus action: mage hand grants you advantage on one attack."),
    f(17, "Spell Thief", "Reaction: steal a spell on a failed save and cast it later."),
  ], [], {
    spellcasting: thirdCasterSlots(
      "int",
      [0, 0, 3, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
      [0, 0, 3, 4, 4, 4, 5, 6, 6, 7, 8, 8, 9, 10, 10, 11, 11, 11, 12, 13]
    ),
  }),
  subclass("draconic", "Draconic Bloodline", "class-sorcerer", 102, [
    f(1, "Dragon Ancestor", "Speak Draconic; double proficiency on CHA checks vs dragons."),
    f(1, "Draconic Resilience", "+1 HP per sorcerer level; unarmored AC 13 + DEX."),
    f(6, "Elemental Affinity", "Add CHA mod to ancestry damage; spend 1 sorcery point to resist that type for 1 hour."),
    f(14, "Dragon Wings", "Bonus action grow wings; fly speed equals walking speed."),
    f(18, "Draconic Presence", "Aura of awe or fear; 5 sorcery points."),
  ], [], { extraHp: 1 }),
  subclass("wild-magic", "Wild Magic", "class-sorcerer", 103, [
    f(1, "Wild Magic Surge", "Casting a sorcerer spell can trigger a random surge."),
    f(1, "Tides of Chaos", "Gain advantage on one roll; the next spell may surge."),
    f(6, "Bend Luck", "Spend 2 sorcery points to add or subtract 1d4 from a nearby roll."),
    f(14, "Controlled Chaos", "Roll twice on the surge table and choose."),
    f(18, "Spell Bombardment", "Once per turn, reroll one maximum damage die."),
  ]),
  subclass("archfey", "The Archfey", "class-warlock", 108, [
    f(1, "Fey Presence", "Charm or frighten nearby creatures for 1 turn; rest recharge."),
    f(6, "Misty Escape", "When hit, vanish and teleport; rest recharge."),
    f(10, "Beguiling Defenses", "Immune to charm; reflect charm onto the attacker."),
    f(14, "Dark Delirium", "Charm or frighten one creature in a private illusion; rest recharge."),
  ]),
  subclass("fiend", "The Fiend", "class-warlock", 109, [
    f(1, "Dark One's Blessing", "When you drop a hostile to 0 HP, gain temp HP = CHA mod + warlock level."),
    f(6, "Dark One's Own Luck", "Add 1d10 to one ability check or save; rest recharge."),
    f(10, "Fiendish Resilience", "After a rest, choose a damage resistance (not silvered magic weapons)."),
    f(14, "Hurl Through Hell", "On a hit, banish the target until your next turn for 10d10 psychic; rest recharge."),
  ]),
  subclass("great-old-one", "The Great Old One", "class-warlock", 109, [
    f(1, "Awakened Mind", "Telepathy 30 ft."),
    f(6, "Entropic Ward", "Impose disadvantage on one attack; if it misses, you gain advantage on your next attack."),
    f(10, "Thought Shield", "Resistance to psychic; attackers take the psychic damage you take."),
    f(14, "Create Thrall", "Touch a stunned humanoid to charm it indefinitely."),
  ]),
  subclass("abjuration", "School of Abjuration", "class-wizard", 115, [
    f(2, "Arcane Ward", "Casting abjuration creates a HP ward; it absorbs damage before you."),
    f(6, "Projected Ward", "Use the ward to protect a nearby creature."),
    f(10, "Improved Abjuration", "Add proficiency to ability checks as part of abjuration spells."),
    f(14, "Spell Resistance", "Advantage on saves vs spells; resistance to spell damage."),
  ]),
  subclass("conjuration", "School of Conjuration", "class-wizard", 116, [
    f(2, "Minor Conjuration", "Action: create a harmless Tiny object for 1 hour."),
    f(6, "Benign Transposition", "Teleport 30 ft. or swap with a willing creature; rest or conjuration spell recharges."),
    f(10, "Focused Conjuration", "Concentration on conjuration spells can't be broken by damage."),
    f(14, "Durable Summons", "Your summoned creatures gain 30 temp HP."),
  ]),
  subclass("divination", "School of Divination", "class-wizard", 116, [
    f(2, "Portent", "After a long rest, roll two d20s and later replace a seen roll."),
    f(6, "Expert Divination", "Casting a 2nd+ divination recovers a lower expended slot."),
    f(10, "The Third Eye", "Choose darkvision, ethereal sight, read any language, or see invisibility until rest."),
    f(14, "Greater Portent", "Three portent dice."),
  ]),
  subclass("enchantment", "School of Enchantment", "class-wizard", 117, [
    f(2, "Hypnotic Gaze", "Charm and incapacitates one nearby creature while you maintain the gaze."),
    f(6, "Instinctive Charm", "Redirect an attack to another target if the attacker fails a WIS save."),
    f(10, "Split Enchantment", "Target a second creature with a 1-target enchantment."),
    f(14, "Alter Memories", "Charmed creatures can forget you influenced them."),
  ]),
  subclass("evocation", "School of Evocation", "class-wizard", 117, [
    f(2, "Sculpt Spells", "Choose creatures to auto-succeed and take no damage from your evocation."),
    f(6, "Potent Cantrip", "Cantrips still deal half damage on a save or miss."),
    f(10, "Empowered Evocation", "Add INT mod to one evocation damage roll."),
    f(14, "Overchannel", "Maximize damage of a 5th-level or lower wizard spell; repeated use deals necrotic backlash."),
  ]),
  subclass("illusion", "School of Illusion", "class-wizard", 118, [
    f(2, "Improved Minor Illusion", "Minor illusion can include both image and sound."),
    f(6, "Malleable Illusions", "Change an illusion's parameters while it lasts."),
    f(10, "Illusory Self", "Reaction: an attack misses you; rest recharge."),
    f(14, "Illusory Reality", "Make one illusion object real for 1 minute."),
  ]),
  subclass("necromancy", "School of Necromancy", "class-wizard", 118, [
    f(2, "Grim Harvest", "When a 1st+ spell kills, regain HP: twice the slot level, triple if necromancy."),
    f(6, "Undead Thralls", "Animate dead extra target; undead you create gain extra HP and damage."),
    f(10, "Inured to Undeath", "Resistance to necrotic; max HP can't be reduced."),
    f(14, "Command Undead", "CHA save or an undead obeys you; intelligent undead get a new save daily."),
  ]),
  subclass("transmutation", "School of Transmutation", "class-wizard", 119, [
    f(2, "Minor Alchemy", "Change one material of a nonmagical object for 1 hour."),
    f(6, "Transmuter's Stone", "A stone grants darkvision, speed, saves, or elemental resistance."),
    f(10, "Shapechanger", "Cast polymorph on yourself into a beast CR 1 or lower without a slot; rest recharge."),
    f(14, "Master Transmuter", "Destroy the stone to panacea, restore life, restore youth, or major transform."),
  ]),
];

const backgroundSeeds = [
  ["acolyte", "Insight, Religion, two languages", "Shelter of the Faithful: lodging and aid at temples of your faith"],
  ["charlatan", "Deception, Sleight of Hand, disguise kit, forgery kit", "False Identity: a second persona with papers and disguises"],
  ["criminal", "Deception, Stealth, gaming set, thieves' tools", "Criminal Contact: a reliable messenger into the underworld"],
  ["entertainer", "Acrobatics, Performance, disguise kit, one instrument", "By Popular Demand: free lodging and local recognition for performances"],
  ["folk-hero", "Animal Handling, Survival, artisan's tools, land vehicles", "Rustic Hospitality: common folk hide and feed you"],
  ["guild-artisan", "Insight, Persuasion, artisan's tools, one language", "Guild Membership: lodging, legal aid, and a network of crafters"],
  ["hermit", "Medicine, Religion, herbalism kit, one language", "Discovery: a unique secret tied to your seclusion"],
  ["noble", "History, Persuasion, gaming set, one language", "Position of Privilege: high-society access and commoner deference"],
  ["outlander", "Athletics, Survival, one instrument, one language", "Wanderer: excellent memory for maps and terrain; forage for yourself and five others"],
  ["sage", "Arcana, History, two languages", "Researcher: you know or can locate who holds a piece of lore"],
  ["sailor", "Athletics, Perception, navigator's tools, water vehicles", "Ship's Passage: free or working travel aboard ships"],
  ["soldier", "Athletics, Intimidation, gaming set, land vehicles", "Military Rank: soldiers loyal to your former organization still defer"],
  ["urchin", "Sleight of Hand, Stealth, disguise kit, thieves' tools", "City Secrets: travel urban streets twice as fast via hidden routes"],
] as const;

const backgrounds = backgroundSeeds.map(([id, proficiencies, feature]) =>
  rule(`background-${id}`, "background", id.replaceAll("-", " ").replace(/\b\w/g, (value) => value.toUpperCase()), {
    sourcePage: 125,
    proficiencies: proficiencies.split(", "),
    features: [f(1, feature.split(": ")[0], feature.split(": ")[1] ?? feature)],
    notes: feature,
  })
);

const ALL_SKILLS = [
  "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception", "History",
  "Insight", "Intimidation", "Investigation", "Medicine", "Nature", "Perception",
  "Performance", "Persuasion", "Religion", "Sleight of Hand", "Stealth", "Survival",
];
const ALL_LANGUAGES = [
  "Dwarvish", "Elvish", "Giant", "Gnomish", "Goblin", "Halfling", "Orc",
  "Abyssal", "Celestial", "Draconic", "Deep Speech", "Infernal", "Primordial",
  "Sylvan", "Undercommon",
];
const INSTRUMENTS = [
  "Bagpipes", "Drum", "Dulcimer", "Flute", "Horn", "Lute", "Lyre", "Pan flute",
  "Shawm", "Viol",
];
const ARTISAN_TOOLS = [
  "Alchemist's supplies", "Brewer's supplies", "Calligrapher's supplies",
  "Carpenter's tools", "Cartographer's tools", "Cobbler's tools", "Cook's utensils",
  "Glassblower's tools", "Jeweler's tools", "Leatherworker's tools", "Mason's tools",
  "Painter's supplies", "Potter's tools", "Smith's tools", "Tinker's tools",
  "Weaver's tools", "Woodcarver's tools",
];
const choice = (
  id: string,
  label: string,
  target: RuleChoiceDefinition["target"],
  count: number,
  options: string[],
  allowCustom = false,
  bonus = 1,
  level = 1,
  levelCounts?: RuleChoiceDefinition["levelCounts"]
): RuleChoiceDefinition => ({
  id,
  label,
  target,
  level,
  count,
  options,
  allowCustom,
  bonus,
  ...(levelCounts ? { levelCounts } : {}),
});
const classSkills = (
  count: number,
  options: string[]
): RuleChoiceDefinition => choice("class-skills", "Class skills", "proficiency", count, options);
const languageChoice = (count: number): RuleChoiceDefinition =>
  choice("languages", "Languages", "language", count, ALL_LANGUAGES, true);
const FIGHTING_STYLES = [
  "Archery",
  "Defense",
  "Dueling",
  "Great Weapon Fighting",
  "Protection",
  "Two-Weapon Fighting",
];
const METAMAGIC_OPTIONS = [
  "Careful Spell",
  "Distant Spell",
  "Empowered Spell",
  "Extended Spell",
  "Heightened Spell",
  "Quickened Spell",
  "Subtle Spell",
  "Twinned Spell",
];

const RULE_CHOICES: Record<string, RuleChoiceDefinition[]> = {
  "race-human": [languageChoice(1)],
  "race-dwarf": [
    choice("craft-tools", "Craft tool", "proficiency", 1, [
      "Smith's tools", "Brewer's supplies", "Mason's tools",
    ]),
  ],
  "race-half-elf": [
    choice("flex-abilities", "Two different ability increases", "ability", 2, [
      "str", "dex", "con", "int", "wis",
    ]),
    choice("versatile-skills", "Skill versatility", "proficiency", 2, ALL_SKILLS),
    languageChoice(1),
  ],
  "subrace-high-elf": [
    choice("cantrip", "Wizard cantrip", "action", 1, [], true),
    languageChoice(1),
  ],
  "subrace-variant-human": [
    choice("flex-abilities", "Two different ability increases", "ability", 2, [
      "str", "dex", "con", "int", "wis", "cha",
    ]),
    choice("skill", "Skill proficiency", "proficiency", 1, ALL_SKILLS),
    choice("talent", "Special talent", "trait", 1, [], true),
  ],
  "race-dragonborn": [
    choice("ancestry", "Draconic ancestry", "trait", 1, [
      "Black — acid line", "Blue — lightning line", "Brass — fire line",
      "Bronze — lightning line", "Copper — acid line", "Gold — fire cone",
      "Green — poison cone", "Red — fire cone", "Silver — cold cone",
      "White — cold cone",
    ]),
  ],
  "class-barbarian": [classSkills(2, ["Animal Handling", "Athletics", "Intimidation", "Nature", "Perception", "Survival"])],
  "class-bard": [
    classSkills(3, ALL_SKILLS),
    choice("instruments", "Musical instruments", "proficiency", 3, INSTRUMENTS, true),
    choice(
      "expertise",
      "Expertise skills",
      "expertise",
      2,
      ALL_SKILLS,
      false,
      1,
      3,
      [{ level: 10, count: 4 }]
    ),
  ],
  "class-cleric": [classSkills(2, ["History", "Insight", "Medicine", "Persuasion", "Religion"])],
  "class-druid": [classSkills(2, ["Arcana", "Animal Handling", "Insight", "Medicine", "Nature", "Perception", "Religion", "Survival"])],
  "class-fighter": [
    classSkills(2, ["Acrobatics", "Animal Handling", "Athletics", "History", "Insight", "Intimidation", "Perception", "Survival"]),
    choice("fighting-style", "Fighting Style", "trait", 1, FIGHTING_STYLES),
  ],
  "class-monk": [
    classSkills(2, ["Acrobatics", "Athletics", "History", "Insight", "Religion", "Stealth"]),
    choice("tool-or-instrument", "Tool or instrument", "proficiency", 1, [...ARTISAN_TOOLS, ...INSTRUMENTS], true),
  ],
  "class-paladin": [
    classSkills(2, ["Athletics", "Insight", "Intimidation", "Medicine", "Persuasion", "Religion"]),
    choice("fighting-style", "Fighting Style", "trait", 1, FIGHTING_STYLES.filter((style) => style !== "Archery"), false, 1, 2),
  ],
  "class-ranger": [
    classSkills(3, ["Animal Handling", "Athletics", "Insight", "Investigation", "Nature", "Perception", "Stealth", "Survival"]),
    choice("fighting-style", "Fighting Style", "trait", 1, ["Archery", "Defense", "Dueling", "Two-Weapon Fighting"], false, 1, 2),
  ],
  "class-rogue": [
    classSkills(4, ["Acrobatics", "Athletics", "Deception", "Insight", "Intimidation", "Investigation", "Perception", "Performance", "Persuasion", "Sleight of Hand", "Stealth"]),
    choice(
      "expertise",
      "Expertise proficiencies",
      "expertise",
      2,
      [...ALL_SKILLS, "Thieves' tools"],
      false,
      1,
      1,
      [{ level: 6, count: 4 }]
    ),
  ],
  "class-sorcerer": [
    classSkills(2, ["Arcana", "Deception", "Insight", "Intimidation", "Persuasion", "Religion"]),
    choice(
      "metamagic",
      "Metamagic options",
      "trait",
      2,
      METAMAGIC_OPTIONS,
      false,
      1,
      3,
      [{ level: 10, count: 3 }, { level: 17, count: 4 }]
    ),
  ],
  "class-warlock": [
    classSkills(2, ["Arcana", "Deception", "History", "Intimidation", "Investigation", "Nature", "Religion"]),
    choice(
      "invocations",
      "Eldritch Invocations",
      "trait",
      2,
      [],
      true,
      1,
      2,
      [
        { level: 5, count: 3 },
        { level: 7, count: 4 },
        { level: 9, count: 5 },
        { level: 12, count: 6 },
        { level: 15, count: 7 },
        { level: 18, count: 8 },
      ]
    ),
    choice("pact-boon", "Pact Boon", "trait", 1, ["Pact of the Chain", "Pact of the Blade", "Pact of the Tome"], false, 1, 3),
  ],
  "class-wizard": [classSkills(2, ["Arcana", "History", "Insight", "Investigation", "Medicine", "Religion"])],
  "background-acolyte": [languageChoice(2)],
  "background-entertainer": [choice("instrument", "Musical instrument", "proficiency", 1, INSTRUMENTS, true)],
  "background-folk-hero": [choice("artisan-tool", "Artisan's tool", "proficiency", 1, ARTISAN_TOOLS, true)],
  "background-guild-artisan": [
    choice("artisan-tool", "Artisan's tool", "proficiency", 1, ARTISAN_TOOLS, true),
    languageChoice(1),
  ],
  "background-hermit": [languageChoice(1)],
  "background-noble": [languageChoice(1)],
  "background-outlander": [
    choice("instrument", "Musical instrument", "proficiency", 1, INSTRUMENTS, true),
    languageChoice(1),
  ],
  "background-sage": [languageChoice(2)],
  "subclass-lore": [choice("bonus-skills", "Bonus skills", "proficiency", 3, ALL_SKILLS)],
  "subclass-battle-master": [choice("artisan-tool", "Artisan's tool", "proficiency", 1, ARTISAN_TOOLS, true)],
  "subclass-champion": [
    choice("additional-fighting-style", "Additional Fighting Style", "trait", 1, FIGHTING_STYLES, false, 1, 10),
  ],
  "subclass-four-elements": [
    choice(
      "elemental-disciplines",
      "Elemental Disciplines",
      "trait",
      1,
      [],
      true,
      1,
      3,
      [{ level: 6, count: 2 }, { level: 11, count: 3 }, { level: 17, count: 4 }]
    ),
  ],
};

export const HANDBOOK_RULES: RuleDefinition[] = [
  ...races,
  ...subraces,
  ...classes,
  ...subclasses,
  ...backgrounds,
].map((entry) => ({
  ...entry,
  choices: RULE_CHOICES[entry.id] ?? [],
  proficiencies: entry.proficiencies.filter(
    (value) => !/\bchoose\b|\bchosen\b|\btwo languages\b|\bone language\b|\bone instrument\b|\bartisan's tools\b/i.test(value)
  ),
  languages: entry.languages.filter((value) => !/\bchosen\b/i.test(value)),
}));
