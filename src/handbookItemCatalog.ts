import type { DamageDie, ItemCategory, LibraryItem } from "./types";

const UNIFORM_ITEM_NAMES: Record<string, string> = {
  "arcane-focus-crystal": "Crystal Arcane Focus",
  "arcane-focus-orb": "Orb Arcane Focus",
  "arcane-focus-rod": "Rod Arcane Focus",
  "arcane-focus-staff": "Staff Arcane Focus",
  "arcane-focus-wand": "Wand Arcane Focus",
  "crossbow-bolt-case": "Crossbow Bolt Case",
  "map-scroll-case": "Map or Scroll Case",
  "chain-10ft": "Chain (10 ft.)",
  "common-clothes": "Common Clothes",
  costume: "Costume Clothes",
  "fine-clothes": "Fine Clothes",
  "travelers-clothes": "Traveler's Clothes",
  "druidic-focus-mistletoe": "Mistletoe Druidic Focus",
  "druidic-focus-totem": "Totem Druidic Focus",
  "druidic-focus-staff": "Wooden Staff Druidic Focus",
  "druidic-focus-wand": "Yew Wand Druidic Focus",
  sledgehammer: "Sledgehammer",
  "holy-symbol-amulet": "Amulet Holy Symbol",
  "holy-symbol-emblem": "Emblem Holy Symbol",
  "holy-symbol-reliquary": "Reliquary Holy Symbol",
  "bullseye-lantern": "Bullseye Lantern",
  "hooded-lantern": "Hooded Lantern",
  ink: "Bottle (Ink, 1 oz.)",
  "steel-mirror": "Steel Mirror",
  "miners-pick": "Miner's Pick",
  "iron-pot": "Iron Pot",
  "healing-potion": "Bottle (Healing Potion)",
  "portable-ram": "Portable Ram",
  "hempen-rope": "Hempen Rope (50 ft.)",
  "silk-rope": "Silk Rope (50 ft.)",
  "merchants-scale": "Merchant's Scale",
  "iron-spikes": "Iron Spikes (10)",
  tent: "Two-Person Tent",
  "string-10ft": "String (10 ft.)",
  "ale-gallon": "Jug (Ale)",
  "ale-mug": "Mug (Ale)",
  "bread-loaf": "Loaf of Bread",
  "cheese-hunk": "Hunk of Cheese",
  "meat-chunk": "Chunk of Meat",
  "common-wine": "Jug (Common Wine)",
  "fine-wine": "Bottle (Fine Wine)",
};

function describeItem(value: LibraryItem): string {
  if (value.category === "weapon") {
    const role = [value.weaponClass, value.weaponRange].filter(Boolean).join(" ");
    const damage = value.damage ? ` It deals ${value.damage} ${value.damageType} damage.` : "";
    return `${value.name} is a ${role || "combat"} weapon.${damage}`.replace(/\s+/g, " ");
  }
  if (value.category === "armor") {
    if (value.equipSlot === "shield") {
      return `${value.name} is carried in one hand and grants a +${value.armorBonus} armor bonus.`;
    }
    const dexterity =
      value.armorDexterity === "full"
        ? " plus Dexterity"
        : value.armorDexterity === "max2"
          ? " plus Dexterity (maximum +2)"
          : "";
    return `${value.name} provides base armor class ${value.armorClass}${dexterity}.`;
  }
  const kind =
    value.category === "tool"
      ? "tool"
      : value.category === "consumable"
        ? "consumable supply"
        : value.category === "material"
          ? "material"
          : value.category === "gear"
            ? "piece of adventuring gear"
            : value.category === "quest"
              ? "quest item"
              : value.category === "junk"
                ? "discarded item"
                : "miscellaneous item";
  return `${value.name} is a ${kind}.`;
}

const item = (
  id: string,
  category: ItemCategory,
  name: string,
  costCp: number,
  weight: number,
  patch: Partial<LibraryItem> = {}
): LibraryItem => {
  const value: LibraryItem = {
    id: `item-${id}`,
    category,
    name: UNIFORM_ITEM_NAMES[id] ?? name,
    rarity: "common",
    description: "",
    value: costCp / 100,
    weight,
    equipSlot: "none",
    armorClass: 0,
    armorBonus: 0,
    hpBonus: 0,
    costCp,
    sourcePage: 0,
    damage: "",
    damageDiceCount: 0,
    damageDie: "d4",
    damageType: "",
    weaponClass: "",
    weaponRange: "",
    properties: [],
    armorDexterity: "none",
    strengthRequirement: 0,
    stealthDisadvantage: false,
    containerType: "",
    contents: "",
    capacity: "",
    actions: [],
    contains: [],
    ...patch,
  };
  value.description ||= describeItem(value);
  return value;
};

const armorSeeds = [
  ["padded", "Padded", 500, 8, 11, "full", 0, true],
  ["leather-armor", "Leather Armor", 1000, 10, 11, "full", 0, false],
  ["studded-leather", "Studded Leather", 4500, 13, 12, "full", 0, false],
  ["hide", "Hide", 1000, 12, 12, "max2", 0, false],
  ["chain-shirt", "Chain Shirt", 5000, 20, 13, "max2", 0, false],
  ["scale-mail", "Scale Mail", 5000, 45, 14, "max2", 0, true],
  ["breastplate", "Breastplate", 40000, 20, 14, "max2", 0, false],
  ["half-plate", "Half Plate", 75000, 40, 15, "max2", 0, true],
  ["ring-mail", "Ring Mail", 3000, 40, 14, "none", 0, true],
  ["chain-mail", "Chain Mail", 7500, 55, 16, "none", 13, true],
  ["splint", "Splint", 20000, 60, 17, "none", 15, true],
  ["plate", "Plate", 150000, 65, 18, "none", 15, true],
] as const;

const armor = armorSeeds.map(
  ([id, name, costCp, weight, armorClass, armorDexterity, strengthRequirement, stealthDisadvantage]) =>
    item(id, "armor", name, costCp, weight, {
      equipSlot: "armor",
      armorClass,
      armorDexterity,
      strengthRequirement,
      stealthDisadvantage,
      sourcePage: 145,
    })
);

armor.push(
  item("shield", "armor", "Shield", 1000, 6, {
    equipSlot: "shield",
    armorBonus: 2,
    sourcePage: 145,
    description: "Only one shield can grant its AC bonus at a time.",
  })
);

const weaponSeeds = [
  ["club", "Club", 10, 2, "1d4", "bludgeoning", "Light"],
  ["dagger", "Dagger", 200, 1, "1d4", "piercing", "Finesse; Light; Thrown 20/60"],
  ["greatclub", "Greatclub", 20, 10, "1d8", "bludgeoning", "Two-handed"],
  ["handaxe", "Handaxe", 500, 2, "1d6", "slashing", "Light; Thrown 20/60"],
  ["javelin", "Javelin", 50, 2, "1d6", "piercing", "Thrown 30/120"],
  ["light-hammer", "Light Hammer", 200, 2, "1d4", "bludgeoning", "Light; Thrown 20/60"],
  ["mace", "Mace", 500, 4, "1d6", "bludgeoning", ""],
  ["quarterstaff", "Quarterstaff", 20, 4, "1d6", "bludgeoning", "Versatile 1d8"],
  ["sickle", "Sickle", 100, 2, "1d4", "slashing", "Light"],
  ["spear", "Spear", 100, 3, "1d6", "piercing", "Thrown 20/60; Versatile 1d8"],
  ["light-crossbow", "Light Crossbow", 2500, 5, "1d8", "piercing", "Ammunition 80/320; Loading; Two-handed"],
  ["dart", "Dart", 5, 0.25, "1d4", "piercing", "Finesse; Thrown 20/60"],
  ["shortbow", "Shortbow", 2500, 2, "1d6", "piercing", "Ammunition 80/320; Two-handed"],
  ["sling", "Sling", 10, 0, "1d4", "bludgeoning", "Ammunition 30/120"],
  ["battleaxe", "Battleaxe", 1000, 4, "1d8", "slashing", "Versatile 1d10"],
  ["flail", "Flail", 1000, 2, "1d8", "bludgeoning", ""],
  ["glaive", "Glaive", 2000, 6, "1d10", "slashing", "Heavy; Reach; Two-handed"],
  ["greataxe", "Greataxe", 3000, 7, "1d12", "slashing", "Heavy; Two-handed"],
  ["greatsword", "Greatsword", 5000, 6, "2d6", "slashing", "Heavy; Two-handed"],
  ["halberd", "Halberd", 2000, 6, "1d10", "slashing", "Heavy; Reach; Two-handed"],
  ["lance", "Lance", 1000, 6, "1d12", "piercing", "Reach; Special"],
  ["longsword", "Longsword", 1500, 3, "1d8", "slashing", "Versatile 1d10"],
  ["maul", "Maul", 1000, 10, "2d6", "bludgeoning", "Heavy; Two-handed"],
  ["morningstar", "Morningstar", 1500, 4, "1d8", "piercing", ""],
  ["pike", "Pike", 500, 18, "1d10", "piercing", "Heavy; Reach; Two-handed"],
  ["rapier", "Rapier", 2500, 2, "1d8", "piercing", "Finesse"],
  ["scimitar", "Scimitar", 2500, 3, "1d6", "slashing", "Finesse; Light"],
  ["shortsword", "Shortsword", 1000, 2, "1d6", "piercing", "Finesse; Light"],
  ["trident", "Trident", 500, 4, "1d6", "piercing", "Thrown 20/60; Versatile 1d8"],
  ["war-pick", "War Pick", 500, 2, "1d8", "piercing", ""],
  ["warhammer", "Warhammer", 1500, 2, "1d8", "bludgeoning", "Versatile 1d10"],
  ["whip", "Whip", 200, 3, "1d4", "slashing", "Finesse; Reach"],
  ["blowgun", "Blowgun", 1000, 1, "1", "piercing", "Ammunition 25/100; Loading"],
  ["hand-crossbow", "Hand Crossbow", 7500, 3, "1d6", "piercing", "Ammunition 30/120; Light; Loading"],
  ["heavy-crossbow", "Heavy Crossbow", 5000, 18, "1d10", "piercing", "Ammunition 100/400; Heavy; Loading; Two-handed"],
  ["longbow", "Longbow", 5000, 2, "1d8", "piercing", "Ammunition 150/600; Heavy; Two-handed"],
  ["net", "Net", 100, 3, "", "", "Special; Thrown 5/15"],
] as const;

const rangedWeaponIds = new Set([
  "light-crossbow",
  "dart",
  "shortbow",
  "sling",
  "blowgun",
  "hand-crossbow",
  "heavy-crossbow",
  "longbow",
  "net",
]);

const weapons = weaponSeeds.map(([id, name, costCp, weight, damage, damageType, properties], index) => {
  const match = damage.match(/^(\d+)d(\d+)$/);
  const damageDiceCount = match ? Number(match[1]) : 0;
  const damageDie = (match ? `d${match[2]}` : "d4") as DamageDie;
  return item(id, "weapon", name, costCp, weight, {
    equipSlot: "weapon",
    damage,
    damageDiceCount,
    damageDie,
    damageType,
    weaponClass: index < 14 ? "simple" : "martial",
    weaponRange: rangedWeaponIds.has(id) ? "ranged" : "melee",
    properties: properties ? properties.split("; ") : [],
    sourcePage: 149,
  });
});

type GearSeed = readonly [
  id: string,
  name: string,
  costCp: number,
  weight: number,
  category?: ItemCategory,
  description?: string,
];

const gearSeeds: GearSeed[] = [
  ["abacus", "Abacus", 200, 2],
  ["acid", "Vial (Acid)", 2500, 1, "consumable", "Ranged improvised attack to deal 2d6 acid damage."],
  ["alchemists-fire", "Flask (Alchemist's Fire)", 5000, 1, "consumable", "Ignites a hit target for recurring 1d4 fire damage until extinguished."],
  ["arrows-20", "Arrows (20)", 100, 1],
  ["blowgun-needles-50", "Blowgun Needles (50)", 100, 1],
  ["crossbow-bolts-20", "Crossbow Bolts (20)", 100, 1.5],
  ["sling-bullets-20", "Sling Bullets (20)", 4, 1.5],
  ["antitoxin", "Vial (Antitoxin)", 5000, 0, "consumable", "Advantage on poison saves for 1 hour; no benefit to undead or constructs."],
  ["arcane-focus-crystal", "Arcane Focus: Crystal", 1000, 1],
  ["arcane-focus-orb", "Arcane Focus: Orb", 2000, 3],
  ["arcane-focus-rod", "Arcane Focus: Rod", 1000, 2],
  ["arcane-focus-staff", "Arcane Focus: Staff", 500, 4],
  ["arcane-focus-wand", "Arcane Focus: Wand", 1000, 1],
  ["backpack", "Backpack", 200, 5],
  ["ball-bearings", "Ball Bearings (1,000)", 100, 2, "gear", "Cover a 10-ft square; DC 10 DEX or fall prone."],
  ["barrel", "Barrel (Empty)", 200, 70],
  ["barrel-oil", "Barrel (Oil)", 5200, 330, "consumable", "A barrel filled with lamp oil."],
  ["barrel-water", "Barrel (Water)", 200, 400, "gear", "A barrel filled with fresh water."],
  ["basket", "Basket", 40, 2],
  ["bedroll", "Bedroll", 100, 7],
  ["bell", "Bell", 100, 0],
  ["blanket", "Blanket", 50, 3],
  ["block-and-tackle", "Block and Tackle", 100, 5, "tool", "Hoist four times normal lifting weight."],
  ["book", "Book", 2500, 5],
  ["glass-bottle", "Bottle (Empty)", 200, 2],
  ["bucket", "Bucket (Empty)", 5, 2],
  ["caltrops", "Caltrops (20)", 100, 2, "consumable", "Cover 5 ft.; DC 15 DEX or stop, take 1 piercing, and lose 10 ft. speed."],
  ["candle", "Candle", 1, 0],
  ["crossbow-bolt-case", "Case, Crossbow Bolt", 100, 1],
  ["map-scroll-case", "Case, Map or Scroll", 100, 1],
  ["chain-10ft", "Chain (10 feet)", 500, 10],
  ["chalk", "Chalk (1 piece)", 1, 0],
  ["chest", "Chest", 500, 25],
  ["climbers-kit", "Climber's Kit", 2500, 12, "tool", "Anchor yourself against falls within 25 ft."],
  ["common-clothes", "Clothes, Common", 50, 3],
  ["costume", "Clothes, Costume", 500, 4],
  ["fine-clothes", "Clothes, Fine", 1500, 6],
  ["travelers-clothes", "Clothes, Traveler's", 200, 4],
  ["component-pouch", "Component Pouch", 2500, 2],
  ["crowbar", "Crowbar", 200, 5, "tool", "Advantage on Strength checks where leverage applies."],
  ["druidic-focus-mistletoe", "Druidic Focus: Mistletoe", 100, 0],
  ["druidic-focus-totem", "Druidic Focus: Totem", 100, 0],
  ["druidic-focus-staff", "Druidic Focus: Wooden Staff", 500, 4],
  ["druidic-focus-wand", "Druidic Focus: Yew Wand", 1000, 1],
  ["fishing-tackle", "Fishing Tackle", 100, 4, "tool"],
  ["flask", "Flask (Empty)", 2, 1],
  ["flask-water", "Flask (Water)", 2, 2, "gear", "A flask filled with fresh water."],
  ["grappling-hook", "Grappling Hook", 200, 4],
  ["hammer", "Hammer", 100, 3, "tool"],
  ["sledgehammer", "Hammer, Sledge", 200, 10, "tool"],
  ["healers-kit", "Healer's Kit", 500, 3, "tool", "Ten uses; stabilize a creature at 0 HP without a Medicine check."],
  ["holy-symbol-amulet", "Holy Symbol: Amulet", 500, 1],
  ["holy-symbol-emblem", "Holy Symbol: Emblem", 500, 0],
  ["holy-symbol-reliquary", "Holy Symbol: Reliquary", 500, 2],
  ["holy-water", "Flask (Holy Water)", 2500, 1, "consumable", "Ranged improvised attack deals 2d6 radiant to fiends or undead."],
  ["hourglass", "Hourglass", 2500, 1],
  ["hunting-trap", "Hunting Trap", 500, 25, "tool", "DC 13 DEX; 1d4 piercing and restrained by chain until freed."],
  ["ink", "Ink (1 ounce)", 1000, 0],
  ["ink-pen", "Ink Pen", 2, 0],
  ["jug", "Jug (Empty)", 2, 4],
  ["ladder", "Ladder (10-foot)", 10, 25],
  ["lamp", "Lamp", 50, 1],
  ["bullseye-lantern", "Lantern, Bullseye", 1000, 2],
  ["hooded-lantern", "Lantern, Hooded", 500, 2],
  ["lock", "Lock", 1000, 1, "gear", "DC 15 Dexterity with thieves' tools to pick."],
  ["magnifying-glass", "Magnifying Glass", 10000, 0],
  ["manacles", "Manacles", 200, 6, "gear", "DC 20 DEX to escape or STR to break; DC 15 to pick."],
  ["mess-kit", "Mess Kit", 20, 1],
  ["steel-mirror", "Mirror, Steel", 500, 0.5],
  ["oil", "Flask (Oil)", 10, 1, "consumable", "Burning coating or 5-ft area deals 5 fire damage under its rules."],
  ["paper", "Paper (sheet)", 20, 0],
  ["parchment", "Parchment (sheet)", 10, 0],
  ["perfume", "Vial (Perfume)", 500, 0],
  ["miners-pick", "Pick, Miner's", 200, 10, "tool"],
  ["piton", "Piton", 5, 0.25],
  ["basic-poison", "Vial (Basic Poison)", 10000, 0, "consumable", "Coat a weapon or three ammunition; DC 10 CON or 1d4 poison damage."],
  ["pole", "Pole (10-foot)", 5, 7],
  ["iron-pot", "Pot, Iron", 200, 10],
  ["healing-potion", "Potion of Healing", 5000, 0.5, "consumable", "Action to drink or administer; regain 2d4 + 2 HP."],
  ["pouch", "Pouch", 50, 1],
  ["quiver", "Quiver", 100, 1],
  ["portable-ram", "Ram, Portable", 400, 35, "tool", "+4 on Strength checks to break doors; helper grants advantage."],
  ["rations", "Rations (1 day)", 50, 2, "consumable"],
  ["robes", "Robes", 100, 4],
  ["hempen-rope", "Rope, Hempen (50 feet)", 100, 10],
  ["silk-rope", "Rope, Silk (50 feet)", 1000, 5],
  ["sack", "Sack", 1, 0.5],
  ["merchants-scale", "Scale, Merchant's", 500, 3, "tool"],
  ["sealing-wax", "Sealing Wax", 50, 0],
  ["shovel", "Shovel", 200, 5, "tool"],
  ["signal-whistle", "Signal Whistle", 5, 0],
  ["signet-ring", "Signet Ring", 500, 0],
  ["soap", "Soap", 2, 0],
  ["spellbook", "Spellbook", 5000, 3],
  ["iron-spikes", "Spikes, Iron (10)", 100, 5],
  ["spyglass", "Spyglass", 100000, 1],
  ["tent", "Tent, Two-Person", 200, 20],
  ["tinderbox", "Tinderbox", 50, 1],
  ["torch", "Torch", 1, 1, "consumable", "Burns 1 hour; bright 20 ft., dim +20 ft.; melee hit deals 1 fire."],
  ["vial", "Vial (Empty)", 100, 0],
  ["waterskin-empty", "Waterskin (Empty)", 20, 1],
  ["waterskin", "Waterskin (Water)", 20, 5],
  ["whetstone", "Whetstone", 1, 1, "tool"],
  ["alms-box", "Alms Box", 10, 1],
  ["incense", "Incense (block)", 10, 0, "consumable"],
  ["censer", "Censer", 50, 1],
  ["vestments", "Vestments", 100, 4],
  ["bag-of-sand", "Bag of Sand", 1, 0.5],
  ["small-knife", "Small Knife", 20, 0.5, "weapon"],
  ["string-10ft", "String (10 feet)", 1, 0],
  ["ale-gallon", "Ale (gallon)", 20, 0, "consumable"],
  ["ale-mug", "Ale (mug)", 4, 0, "consumable"],
  ["bread-loaf", "Bread (loaf)", 2, 0, "consumable"],
  ["cheese-hunk", "Cheese (hunk)", 10, 0, "consumable"],
  ["meat-chunk", "Meat (chunk)", 30, 0, "consumable"],
  ["common-wine", "Wine, Common (pitcher)", 20, 0, "consumable"],
  ["fine-wine", "Wine, Fine (bottle)", 1000, 0, "consumable"],
];

const containerDetails: Record<string, Partial<LibraryItem>> = {
  acid: { containerType: "vial", contents: "Acid", capacity: "4 oz." },
  "alchemists-fire": {
    containerType: "flask",
    contents: "Alchemist's Fire",
    capacity: "1 pint",
  },
  antitoxin: { containerType: "vial", contents: "Antitoxin", capacity: "4 oz." },
  "ale-gallon": { containerType: "jug", contents: "Ale", capacity: "1 gal." },
  barrel: { containerType: "barrel", capacity: "40 gal." },
  "barrel-oil": { containerType: "barrel", contents: "Oil", capacity: "40 gal." },
  "barrel-water": { containerType: "barrel", contents: "Water", capacity: "40 gal." },
  bucket: { containerType: "bucket", capacity: "3 gal." },
  flask: { containerType: "flask", capacity: "1 pint" },
  "flask-water": { containerType: "flask", contents: "Water", capacity: "1 pint" },
  "glass-bottle": { containerType: "bottle", capacity: "1.5 pints" },
  "healing-potion": {
    containerType: "bottle",
    contents: "Healing Potion",
    capacity: "4 oz.",
  },
  "holy-water": { containerType: "flask", contents: "Holy Water", capacity: "1 pint" },
  jug: { containerType: "jug", capacity: "1 gal." },
  ink: { containerType: "bottle", contents: "Ink", capacity: "1 oz." },
  oil: { containerType: "flask", contents: "Oil", capacity: "1 pint" },
  perfume: { containerType: "vial", contents: "Perfume", capacity: "4 oz." },
  "common-wine": {
    containerType: "jug",
    contents: "Common Wine",
    capacity: "1 gal.",
  },
  "fine-wine": {
    containerType: "bottle",
    contents: "Fine Wine",
    capacity: "1.5 pints",
  },
  "basic-poison": { containerType: "vial", contents: "Basic Poison", capacity: "4 oz." },
  vial: { containerType: "vial", capacity: "4 oz." },
  waterskin: { containerType: "waterskin", contents: "Water", capacity: "4 pints" },
  "waterskin-empty": { containerType: "waterskin", capacity: "4 pints" },
  "small-knife": {
    equipSlot: "weapon",
    damage: "1d4",
    damageDiceCount: 1,
    damageDie: "d4",
    damageType: "piercing",
    weaponClass: "simple",
    weaponRange: "melee",
    properties: ["Finesse", "Light"],
  },
};

const gear = gearSeeds.map(([id, name, costCp, weight, category = "gear", description = ""]) =>
  item(id, category, name, costCp, weight, {
    description,
    sourcePage: 150,
    ...(containerDetails[id] ?? {}),
  })
);

const toolSeeds = [
  ["alchemists-supplies", "Alchemist's Supplies", 5000, 8],
  ["brewers-supplies", "Brewer's Supplies", 2000, 9],
  ["calligraphers-supplies", "Calligrapher's Supplies", 1000, 5],
  ["carpenters-tools", "Carpenter's Tools", 800, 6],
  ["cartographers-tools", "Cartographer's Tools", 1500, 6],
  ["cobblers-tools", "Cobbler's Tools", 500, 5],
  ["cooks-utensils", "Cook's Utensils", 100, 8],
  ["glassblowers-tools", "Glassblower's Tools", 3000, 5],
  ["jewelers-tools", "Jeweler's Tools", 2500, 2],
  ["leatherworkers-tools", "Leatherworker's Tools", 500, 5],
  ["masons-tools", "Mason's Tools", 1000, 8],
  ["painters-supplies", "Painter's Supplies", 1000, 5],
  ["potters-tools", "Potter's Tools", 1000, 3],
  ["smiths-tools", "Smith's Tools", 2000, 8],
  ["tinkers-tools", "Tinker's Tools", 5000, 10],
  ["weavers-tools", "Weaver's Tools", 100, 5],
  ["woodcarvers-tools", "Woodcarver's Tools", 100, 5],
  ["disguise-kit", "Disguise Kit", 2500, 3],
  ["forgery-kit", "Forgery Kit", 1500, 5],
  ["dice-set", "Dice Set", 10, 0],
  ["dragonchess-set", "Dragonchess Set", 100, 0.5],
  ["playing-card-set", "Playing Card Set", 50, 0],
  ["three-dragon-ante", "Three-Dragon Ante Set", 100, 0],
  ["herbalism-kit", "Herbalism Kit", 500, 3],
  ["bagpipes", "Bagpipes", 3000, 6],
  ["drum", "Drum", 600, 3],
  ["dulcimer", "Dulcimer", 2500, 10],
  ["flute", "Flute", 200, 1],
  ["lute", "Lute", 3500, 2],
  ["lyre", "Lyre", 3000, 2],
  ["horn", "Horn", 300, 2],
  ["pan-flute", "Pan Flute", 1200, 2],
  ["shawm", "Shawm", 200, 1],
  ["viol", "Viol", 3000, 1],
  ["navigators-tools", "Navigator's Tools", 2500, 2],
  ["poisoners-kit", "Poisoner's Kit", 5000, 2],
  ["thieves-tools", "Thieves' Tools", 2500, 1],
] as const;

const tools = toolSeeds.map(([id, name, costCp, weight]) =>
  item(id, "tool", name, costCp, weight, { sourcePage: 154 })
);

const packed = (
  ...entries: Array<string | readonly [string, number]>
): string[] =>
  entries.map((entry) => {
    if (typeof entry === "string") return `item-${entry}`;
    return entry[1] > 1 ? `item-${entry[0]}:${entry[1]}` : `item-${entry[0]}`;
  });

const packSeeds = [
  [
    "burglars-pack",
    "Burglar's Pack",
    1600,
    packed(
      "backpack",
      "ball-bearings",
      "string-10ft",
      "bell",
      ["candle", 5],
      "crowbar",
      "hammer",
      ["piton", 10],
      "hooded-lantern",
      ["oil", 2],
      ["rations", 5],
      "tinderbox",
      "waterskin",
      "hempen-rope"
    ),
  ],
  [
    "diplomats-pack",
    "Diplomat's Pack",
    3900,
    packed(
      "chest",
      ["map-scroll-case", 2],
      "fine-clothes",
      "ink",
      "ink-pen",
      "lamp",
      ["oil", 2],
      ["paper", 5],
      "perfume",
      "sealing-wax",
      "soap"
    ),
  ],
  [
    "dungeoneers-pack",
    "Dungeoneer's Pack",
    1200,
    packed(
      "backpack",
      "crowbar",
      "hammer",
      ["piton", 10],
      ["torch", 10],
      "tinderbox",
      ["rations", 10],
      "waterskin",
      "hempen-rope"
    ),
  ],
  [
    "entertainers-pack",
    "Entertainer's Pack",
    4000,
    packed(
      "backpack",
      "bedroll",
      ["costume", 2],
      ["candle", 5],
      ["rations", 5],
      "waterskin",
      "disguise-kit"
    ),
  ],
  [
    "explorers-pack",
    "Explorer's Pack",
    1000,
    packed(
      "backpack",
      "bedroll",
      "mess-kit",
      "tinderbox",
      ["torch", 10],
      ["rations", 10],
      "waterskin",
      "hempen-rope"
    ),
  ],
  [
    "priests-pack",
    "Priest's Pack",
    1900,
    packed(
      "backpack",
      "blanket",
      ["candle", 10],
      "tinderbox",
      "alms-box",
      ["incense", 2],
      "censer",
      "vestments",
      ["rations", 2],
      "waterskin"
    ),
  ],
  [
    "scholars-pack",
    "Scholar's Pack",
    4000,
    packed(
      "backpack",
      "book",
      "ink",
      "ink-pen",
      ["parchment", 10],
      "bag-of-sand",
      "small-knife"
    ),
  ],
] as const;

const packs = packSeeds.map(([id, name, costCp, contains]) =>
  item(id, "gear", name, costCp, 0, {
    sourcePage: 151,
    contains: [...contains],
    description: `Contains ${contains.length} bundled items.`,
  })
);

const trinketNames = [
  "Mummified goblin hand",
  "Moon-glowing crystal",
  "Coin from an unknown land",
  "Diary in an unknown language",
  "Untarnishing brass ring",
  "Glass chess piece",
  "Skull-marked knucklebone dice",
  "Nightmare-inducing idol",
  "Necklace of four mummified elf fingers",
  "Deed to land in an unknown realm",
  "One-ounce block of unknown material",
  "Needle-skewered cloth doll",
  "Tooth from an unknown beast",
  "Enormous dragon-like scale",
  "Bright green feather",
  "Divination card bearing your likeness",
  "Glass orb of moving smoke",
  "One-pound red-shelled egg",
  "Bubble-blowing pipe",
  "Jar of strange preserved flesh",
  "Gnome-crafted music box",
  "Statuette of a smug halfling",
  "Rune-etched brass orb",
  "Multicolored stone disk",
  "Tiny silver raven icon",
  "Bag of forty-seven humanoid teeth",
  "Always-warm obsidian shard",
  "Dragon talon necklace",
  "Pair of old socks",
  "Blank book that rejects markings",
  "Five-pointed silver badge",
  "Knife inherited from a relative",
  "Vial of nail clippings",
  "Water-sparking metal device",
  "White sequined glove",
  "Vest with one hundred pockets",
  "Weightless stone block",
  "Tiny goblin portrait",
  "Empty perfume-scented vial",
  "Gemstone that looks like coal to others",
  "Scrap of an old banner",
  "Lost legion rank insignia",
  "Silver bell without a clapper",
  "Mechanical canary in a gnomish lamp",
  "Tiny chest carved with feet",
  "Dead sprite in a bottle",
  "Sealed can with shifting sounds",
  "Water-filled orb with a clockwork goldfish",
  "Silver spoon engraved with M",
  "Gold-colored wooden whistle",
  "Hand-sized dead scarab",
  "Two toy soldiers, one headless",
  "Box of assorted buttons",
  "Candle that cannot be lit",
  "Tiny cage without a door",
  "Old key",
  "Indecipherable treasure map",
  "Hilt from a broken sword",
  "Rabbit's foot",
  "Glass eye",
  "Cameo of a hideous person",
  "Coin-sized silver skull",
  "Alabaster mask",
  "Foul-smelling black incense pyramid",
  "Nightcap that gives pleasant dreams",
  "Bone caltrop",
  "Gold monocle frame without a lens",
  "Six-colored one-inch cube",
  "Crystal doorknob",
  "Packet of pink dust",
  "Fragment of a beautiful song",
  "Silver teardrop earring",
  "Painted eggshell of human misery",
  "Fan depicting a sleeping cat",
  "Set of bone pipes",
  "Four-leaf clover in a manners book",
  "Drawing of a complex machine",
  "Ornate scabbard that fits no known blade",
  "Invitation to a party where a murder occurred",
  "Bronze rat-headed pentacle",
  "Archmage's embroidered handkerchief",
  "Half of a building floorplan",
  "Folded cloth that becomes a cap",
  "Receipt from a distant bank",
  "Diary with seven missing pages",
  "Silver snuffbox engraved with dreams",
  "Iron symbol of an unknown god",
  "Heroic legend missing its last chapter",
  "Vial of dragon blood",
  "Ancient elven arrow",
  "Needle that never bends",
  "Ornate dwarven brooch",
  "Wizard of Wines bottle",
  "Multicolored mosaic tile",
  "Petrified mouse",
  "Dragon-skull pirate flag",
  "Mechanical crab that moves unobserved",
  "Jar labeled Griffon Grease",
  "Box holding a two-headed worm",
  "Urn containing a hero's ashes",
] as const;

const trinkets = trinketNames.map((name, index) =>
  item(`curio-${String(index + 1).padStart(3, "0")}`, "gear", name, 0, 0, {
    sourcePage: index < 50 ? 159 : 160,
    equipSlot: "gear",
    description: `A distinctive personal curio (table result ${index + 1}).`,
  })
);

const transportSeeds = [
  ["camel", "Camel", 5000, 0, "50 ft.; carrying capacity 480 lb."],
  ["donkey-mule", "Donkey or Mule", 800, 0, "40 ft.; carrying capacity 420 lb."],
  ["elephant", "Elephant", 20000, 0, "40 ft.; carrying capacity 1,320 lb."],
  ["draft-horse", "Draft Horse", 5000, 0, "40 ft.; carrying capacity 540 lb."],
  ["riding-horse", "Riding Horse", 7500, 0, "60 ft.; carrying capacity 480 lb."],
  ["mastiff", "Mastiff", 2500, 0, "40 ft.; carrying capacity 195 lb."],
  ["pony", "Pony", 3000, 0, "40 ft.; carrying capacity 225 lb."],
  ["warhorse", "Warhorse", 40000, 0, "60 ft.; carrying capacity 540 lb."],
  ["bit-bridle", "Bit and Bridle", 200, 1, ""],
  ["carriage", "Carriage", 10000, 600, ""],
  ["cart", "Cart", 1500, 200, ""],
  ["chariot", "Chariot", 25000, 100, ""],
  ["feed", "Feed (per day)", 5, 10, ""],
  ["exotic-saddle", "Saddle, Exotic", 6000, 40, "Required for aquatic or flying mounts."],
  ["military-saddle", "Saddle, Military", 2000, 30, "Advantage on checks to remain mounted."],
  ["pack-saddle", "Saddle, Pack", 500, 15, ""],
  ["riding-saddle", "Saddle, Riding", 1000, 25, ""],
  ["saddlebags", "Saddlebags", 400, 8, ""],
  ["sled", "Sled", 2000, 300, ""],
  ["stabling", "Stabling (per day)", 50, 0, ""],
  ["wagon", "Wagon", 3500, 400, ""],
  ["galley", "Galley", 3000000, 0, "Waterborne vehicle; 4 mph."],
  ["keelboat", "Keelboat", 300000, 0, "Waterborne vehicle; 1 mph."],
  ["longship", "Longship", 1000000, 0, "Waterborne vehicle; 3 mph."],
  ["rowboat", "Rowboat", 5000, 100, "Waterborne vehicle; 1.5 mph."],
  ["sailing-ship", "Sailing Ship", 1000000, 0, "Waterborne vehicle; 2 mph."],
  ["warship", "Warship", 2500000, 0, "Waterborne vehicle; 2.5 mph."],
] as const;

const transports = transportSeeds.map(([id, name, costCp, weight, description]) =>
  item(id, "misc", name, costCp, weight, { sourcePage: 155, description })
);

const tradeGoodSeeds: Array<readonly [string, string, number, number?]> = [
  ["goods", "Assorted Trade Goods", 100],
  ["wheat", "Wheat (1 lb.)", 1],
  ["flour", "Flour (1 lb.)", 2],
  ["chicken", "Chicken", 2, 0],
  ["salt", "Salt (1 lb.)", 5],
  ["iron", "Iron (1 lb.)", 10],
  ["canvas", "Canvas (1 sq. yd.)", 10, 0],
  ["copper", "Copper (1 lb.)", 50],
  ["cotton", "Cotton Cloth (1 sq. yd.)", 50, 0],
  ["ginger", "Ginger (1 lb.)", 100],
  ["goat", "Goat", 100, 0],
  ["cinnamon", "Cinnamon (1 lb.)", 200],
  ["pepper", "Pepper (1 lb.)", 200],
  ["sheep", "Sheep", 200, 0],
  ["cloves", "Cloves (1 lb.)", 300],
  ["pig", "Pig", 300, 0],
  ["silver", "Silver (1 lb.)", 500],
  ["linen", "Linen (1 sq. yd.)", 500, 0],
  ["silk", "Silk (1 sq. yd.)", 1000, 0],
  ["cow", "Cow", 1000, 0],
  ["saffron", "Saffron (1 lb.)", 1500],
  ["ox", "Ox", 1500, 0],
  ["gold", "Gold (1 lb.)", 5000],
  ["platinum", "Platinum (1 lb.)", 50000],
];

const tradeGoods = tradeGoodSeeds.map(([id, name, costCp, weight = 1]) =>
  item(`trade-${id}`, "material", name, costCp, weight, {
    sourcePage: 157,
    description: "Trade good; normally retains full market value.",
  })
);

export const HANDBOOK_ITEMS: LibraryItem[] = [
  ...armor,
  ...weapons,
  ...gear,
  ...tools,
  ...packs,
  ...trinkets,
  ...transports,
  ...tradeGoods,
];
