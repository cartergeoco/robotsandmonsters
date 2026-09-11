import type {
  AISettings,
  Combatant,
  CombatState,
  Environment,
  EnvironmentLighting,
  EnvironmentWeather,
  LibraryItem,
  LogEntry,
  MapToken,
  PC,
  RuleDefinition,
  SessionMemory,
  TokenCell,
} from "./types";
import {
  ENVIRONMENT_LIGHTING_LABELS,
  ENVIRONMENT_WEATHER_LABELS,
  FEET_PER_CELL,
  abilityMod,
  activeCreatureRules,
  calculateCreatureStats,
  formatMod,
  parseContainedItem,
  rectangularTokenBounds,
  resolvedCreatureProfile,
  tokenDisplayName,
} from "./types";
import { observerCanPerceive } from "./perception";
import { activeCombatant, combatantSpeed, movementBudget } from "./combat";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

/** Rough token estimate; good enough for budgeting a prompt. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function compactText(value: string): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clip(value: string, maxChars: number): string {
  const text = compactText(value);
  return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}

function addLine(lines: string[], key: string, values: string[]) {
  const compact = [...new Set(values.map(compactText).filter(Boolean))];
  if (compact.length) lines.push(`${key}|${compact.join(";")}`);
}

function itemName(id: string, libraryItems: LibraryItem[]): string {
  return libraryItems.find((entry) => entry.id === id)?.name ?? id.replace(/^item-/, "");
}

function packedName(entry: string, libraryItems: LibraryItem[]): string {
  const { libraryItemId, qty } = parseContainedItem(entry);
  const name = itemName(libraryItemId, libraryItems);
  return qty > 1 ? `${name}×${qty}` : name;
}

export function gearMechanics(catalog: LibraryItem, libraryItems: LibraryItem[]): string {
  const pack = (catalog.contains ?? [])
    .map((id) => packedName(id, libraryItems))
    .filter(Boolean);
  const description = compactText(catalog.description);
  return [
    catalog.damage
      ? `dmg=${catalog.damage}${catalog.damageType ? ` ${catalog.damageType}` : ""}`
      : "",
    catalog.armorClass ? `AC=${catalog.armorClass}/${catalog.armorDexterity}` : "",
    catalog.armorBonus ? `ACbonus=${formatMod(catalog.armorBonus)}` : "",
    catalog.properties.length ? `prop=${catalog.properties.join(",")}` : "",
    pack.length ? `pack=${pack.join("+")}` : "",
    description && !description.startsWith("Contains ") ? description : "",
  ]
    .filter(Boolean)
    .join(",");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Mechanics worth looking up for an item the character is not carrying.
 * Returns "" for catalog filler whose description only restates its name,
 * so incidental prose cannot pull in useless entries.
 */
function itemLoreText(item: LibraryItem, libraryItems: LibraryItem[]): string {
  const pack = (item.contains ?? [])
    .map((id) => packedName(id, libraryItems))
    .filter(Boolean);
  const mechanical = [
    item.damage
      ? `dmg=${item.damage}${item.damageType ? ` ${item.damageType}` : ""}`
      : "",
    item.armorClass ? `AC=${item.armorClass}/${item.armorDexterity}` : "",
    item.armorBonus ? `ACbonus=${formatMod(item.armorBonus)}` : "",
    item.properties.length ? `prop=${item.properties.join(",")}` : "",
    pack.length ? `pack=${pack.join("+")}` : "",
    (item.actions ?? []).length ? `use=${item.actions.join(";")}` : "",
  ].filter(Boolean);
  const description = compactText(item.description);
  const boilerplate = new RegExp(
    `^${escapeRegExp(compactText(item.name))} is an? [^.]*\\.$`,
    "i"
  );
  const useful =
    description && !description.startsWith("Contains ") && !boilerplate.test(description)
      ? description
      : "";
  if (!mechanical.length && !useful) return "";
  return [...mechanical, useful].filter(Boolean).join(",");
}

function notesAreCovered(notes: string, features: { name: string; effect: string }[]): boolean {
  const compactNotes = compactText(notes);
  if (!compactNotes) return true;
  return features.some((feature) => {
    const effect = compactText(feature.effect);
    const labeled = compactText(`${feature.name}: ${feature.effect}`);
    return compactNotes === effect || compactNotes === labeled;
  });
}

/**
 * Produces a compact, deterministic character packet for an AI PC.
 * It excludes UI/persistence data while retaining selected rules, derived stats,
 * equipment mechanics, statuses, roleplay details, and user-authored text.
 */
function buildCharacterLines(
  pc: PC,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): string[] {
  const activeRules = activeCreatureRules(pc, rules);
  const calculated = calculateCreatureStats(pc, rules, libraryItems);
  const profile = resolvedCreatureProfile(pc, rules);
  const chosenAbilityBonus = (ability: (typeof ABILITIES)[number]) =>
    activeRules.reduce(
      (sum, entry) =>
        sum +
        (entry.choices ?? [])
          .filter((choice) => choice.target === "ability")
          .reduce(
            (choiceSum, choice) =>
              choiceSum +
              (pc.ruleChoices?.[`${entry.id}:${choice.id}`] ?? []).filter(
                (value) => value === ability
              ).length *
                (choice.bonus ?? 1),
            0
          ),
      0
    );
  const effectiveAbilities = Object.fromEntries(
    ABILITIES.map((ability) => [
      ability,
      pc.abilities[ability] +
        activeRules.reduce(
          (sum, entry) => sum + (entry.abilityBonuses[ability] ?? 0),
          0
        ) +
        chosenAbilityBonus(ability),
    ])
  ) as Record<(typeof ABILITIES)[number], number>;
  const identityRules = activeRules.map((entry) => `${entry.kind}=${entry.name}`);
  const lines = [
    "FMT|*eq;-carried;BUILD=kind=name;RULE=Name{feature=effect};GEAR=*NamexN{dmg,AC,pack=A+B}",
    `PC|${compactText(pc.name)}|L${Math.max(1, pc.level)}|${profile.creatureType}|${profile.size}`,
    `BUILD|${identityRules.join(";") || `${compactText(pc.race)};${compactText(pc.className)}`}`,
    `VITAL|HP=${pc.hp}/${calculated.maxHp};AC=${calculated.armorClass};PB=${formatMod(calculated.proficiencyBonus)};SPD=${calculated.speed};DC=${calculated.saveDc}`,
    `ABIL|${ABILITIES.map((ability) => {
      const score = effectiveAbilities[ability];
      return `${ability.toUpperCase()}=${score}/${formatMod(abilityMod(score))}`;
    }).join(";")}`,
    `SAVE|${ABILITIES.map(
      (ability) => `${ability.toUpperCase()}=${formatMod(calculated.savingThrows[ability] ?? 0)}`
    ).join(";")}`,
    `RP|alignment=${compactText(pc.alignment) || "-"};personality=${compactText(pc.personality) || "-"}`,
    `WALLET|${pc.wallet.gold}gp;${pc.wallet.silver}sp;${pc.wallet.copper}cp`,
  ];

  addLine(lines, "SKILL", calculated.skillBonuses);
  addLine(lines, "PROF", calculated.proficiencies);
  addLine(lines, "SENSE", calculated.senses);
  addLine(lines, "LANG", calculated.languages);
  addLine(lines, "DEF", [
    calculated.vulnerabilities.length
      ? `vuln=${calculated.vulnerabilities.join(",")}`
      : "",
    calculated.resistances.length ? `res=${calculated.resistances.join(",")}` : "",
    calculated.damageImmunities.length
      ? `dmgImm=${calculated.damageImmunities.join(",")}`
      : "",
    calculated.conditionImmunities.length
      ? `condImm=${calculated.conditionImmunities.join(",")}`
      : "",
  ]);
  addLine(
    lines,
    "TRAIT",
    pc.traits.map((entry) => `${entry.name}=${entry.description}`)
  );
  addLine(
    lines,
    "FEATURE",
    pc.features.map((entry) => `${entry.name}=${entry.description}`)
  );
  addLine(
    lines,
    "STATUS",
    pc.statuses.map((entry) => `${entry.kind}:${entry.name}${entry.note ? `=${entry.note}` : ""}`)
  );
  addLine(
    lines,
    "GEAR",
    pc.inventory.map((carried) => {
      const catalog = libraryItems.find((entry) => entry.id === carried.libraryItemId);
      const mechanics = catalog ? gearMechanics(catalog, libraryItems) : "";
      return `${carried.equipped ? "*" : "-"}${compactText(carried.name)}x${carried.qty}${mechanics ? `{${mechanics}}` : ""}${carried.notes ? `[${compactText(carried.notes)}]` : ""}`;
    })
  );
  addLine(
    lines,
    "RULE",
    activeRules.map((entry) => {
      const parts = [
        ...entry.features
          .filter((ruleFeature) => ruleFeature.level <= pc.level)
          .map(
            (ruleFeature) =>
              `${ruleFeature.name}${ruleFeature.effect ? `=${ruleFeature.effect}` : ""}`
          ),
        notesAreCovered(entry.notes, entry.features) ? "" : `note=${compactText(entry.notes)}`,
      ].filter(Boolean);
      return parts.length ? `${entry.name}{${parts.join(";")}}` : "";
    })
  );
  addLine(
    lines,
    "CHOICE",
    activeRules.flatMap((entry) =>
      (entry.choices ?? []).flatMap((choice) => {
        const values = pc.ruleChoices?.[`${entry.id}:${choice.id}`] ?? [];
        return values.length ? [`${entry.name}:${choice.label}=${values.join(",")}`] : [];
      })
    )
  );
  addLine(lines, "ACTION", calculated.specialActions);
  return lines;
}

export type CharacterSheetSection =
  | "summary"
  | "vitals"
  | "abilities"
  | "skills"
  | "defenses"
  | "personality"
  | "inventory"
  | "features"
  | "actions";

/** Stable sheet slices used by both the opening packet and self-query tools. */
export function characterSheetSections(
  pc: PC,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): Record<CharacterSheetSection, string> {
  const lines = buildCharacterLines(pc, rules, libraryItems);
  const group = (...prefixes: string[]) =>
    lines.filter((line) => prefixes.some((prefix) => line.startsWith(prefix))).join("\n");
  return {
    summary: group("FMT|", "PC|", "BUILD|"),
    vitals: group("VITAL|", "STATUS|"),
    abilities: group("ABIL|", "SAVE|"),
    skills: group("SKILL|", "PROF|", "SENSE|", "LANG|"),
    defenses: group("DEF|"),
    personality: group("RP|", "WALLET|"),
    inventory: group("GEAR|"),
    features: group("TRAIT|", "FEATURE|", "RULE|", "CHOICE|"),
    actions: group("ACTION|"),
  };
}

export function compactCharacterContext(
  pc: PC,
  rules: RuleDefinition[],
  libraryItems: LibraryItem[]
): string {
  return Object.values(characterSheetSections(pc, rules, libraryItems))
    .filter(Boolean)
    .join("\n");
}

/**
 * Always-on rules every character needs each turn. Anything deeper is looked up
 * from the rule library only when the moment mentions it.
 */
export const CORE_RULES_CARD = [
  "TURN|move up to your speed plus one action; a bonus action only if a feature grants one; one reaction per round",
  "ACTION|Attack, Cast, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object, Grapple, Shove",
  "CHECK|d20 + ability modifier + proficiency when trained, against a difficulty the GM sets",
  "ADV|advantage rolls two d20 and keeps the higher, disadvantage keeps the lower; they cancel and never stack",
  "ATTACK|d20 + ability modifier + proficiency against armour class; a natural 20 always hits",
  "COVER|half cover grants +2 AC, three-quarters +5, total cover cannot be targeted directly",
  "REACH|leaving a hostile creature's reach without disengaging invites an opportunity attack",
  "DOWN|at 0 hit points you fall unconscious and start dying; the GM rolls death saves (10+ succeeds, 1 is two failures, 20 stands with 1 HP); three failures and you die; any healing wakes you",
  "REST|a short rest spends hit dice, a long rest restores hit points and most daily resources",
  "COND|prone, grappled, restrained, blinded, deafened, frightened, poisoned, and stunned each limit what you can do",
  "HIDE|you need cover or obscurity to hide; others notice you if their passive Perception meets or beats your Stealth check and they are close enough",
  "TABLE|you declare intent only; the GM sets difficulties, rolls outcomes, and narrates results",
].join("\n");

interface Placed {
  x: number;
  y: number;
  width: number;
  height: number;
  bounds: TokenCell[];
}

export interface EntityHandles {
  byId: Record<string, string>;
  byHandle: Record<string, string>;
}

export function createEntityHandles(pc: PC, party: PC[], tokens: MapToken[]): EntityHandles {
  const byId: Record<string, string> = {};
  const byHandle: Record<string, string> = {};
  const orderedParty = [pc, ...party.filter((member) => member.id !== pc.id)];
  orderedParty.forEach((member, index) => {
    const handle = `pc_${index + 1}`;
    byId[member.id] = handle;
    byHandle[handle] = member.id;
  });
  tokens.forEach((token, index) => {
    const handle = `tok_${index + 1}`;
    byId[token.id] = handle;
    byHandle[handle] = token.id;
  });
  return { byId, byHandle };
}

export function handleForEntity(handles: EntityHandles, id: string): string {
  return handles.byId[id] ?? "unknown";
}

function occupiedCells(entity: Placed): TokenCell[] {
  const bounds = entity.bounds?.length
    ? entity.bounds
    : rectangularTokenBounds(entity.width, entity.height);
  return bounds.map((cell) => ({ x: entity.x + cell.x, y: entity.y + cell.y }));
}

/** Chebyshev gap in cells between the closest occupied squares. */
function cellGap(a: Placed, b: Placed): number {
  let best = Number.POSITIVE_INFINITY;
  for (const cellA of occupiedCells(a)) {
    for (const cellB of occupiedCells(b)) {
      best = Math.min(
        best,
        Math.max(Math.abs(cellA.x - cellB.x), Math.abs(cellA.y - cellB.y))
      );
    }
  }
  return best;
}

export function distanceFeet(a: Placed, b: Placed): number {
  return cellGap(a, b) * FEET_PER_CELL;
}

function center(entity: Placed): { x: number; y: number } {
  const cells = occupiedCells(entity);
  if (!cells.length) return { x: entity.x, y: entity.y };
  return {
    x: cells.reduce((sum, cell) => sum + cell.x, 0) / cells.length,
    y: cells.reduce((sum, cell) => sum + cell.y, 0) / cells.length,
  };
}

/** Compass bearing from `from` to `to`. Grid rows grow southward. */
export function bearing(from: Placed, to: Placed): string {
  const origin = center(from);
  const target = center(to);
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const vertical = dy <= -0.5 ? "N" : dy >= 0.5 ? "S" : "";
  const horizontal = dx >= 0.5 ? "E" : dx <= -0.5 ? "W" : "";
  return `${vertical}${horizontal}` || "alongside";
}

export function position(from: Placed, to: Placed): string {
  const feet = distanceFeet(from, to);
  if (!Number.isFinite(feet)) return "position unknown";
  if (feet === 0) return "in your square";
  return `${feet}ft ${bearing(from, to)}`;
}

/** What an onlooker can tell about a creature's condition. */
export function healthWord(
  hp: number,
  maxHp: number,
  deathSaves?: { stable?: boolean; dead?: boolean } | null
): string {
  if (deathSaves?.dead) return "dead";
  if (hp <= 0) return deathSaves?.stable ? "stable" : "dying";
  if (maxHp <= 0) return "standing";
  const ratio = hp / maxHp;
  if (ratio <= 0.25) return "near death";
  if (ratio <= 0.5) return "badly hurt";
  if (ratio < 1) return "wounded";
  return "unhurt";
}

function statusList(statuses: { name: string; kind: string }[]): string {
  return [...new Set(statuses.map((status) => compactText(status.name)).filter(Boolean))].join(
    ","
  );
}

/**
 * One line per ally: what a companion can reasonably see and be told, rather
 * than a second full character sheet.
 */
export function compactPartyRoster(
  pc: PC,
  party: PC[],
  rules: RuleDefinition[],
  libraryItems: LibraryItem[],
  perceptionRadius = Number.POSITIVE_INFINITY,
  handles?: EntityHandles
): string {
  const others = party.filter(
    (member) =>
      member.id !== pc.id &&
      observerCanPerceive(pc, member, rules, libraryItems, perceptionRadius)
  );
  if (!others.length) {
    return party.some((member) => member.id !== pc.id)
      ? "PARTY|you cannot currently see your companions"
      : "PARTY|none — you are on your own";
  }
  const lines = others
    .map((ally) => {
      const calculated = calculateCreatureStats(ally, rules, libraryItems);
      const build =
        [compactText(ally.race), compactText(ally.className)].filter(Boolean).join(" ") ||
        "adventurer";
      const statuses = visibleStatuses(ally.statuses);
      return [
        handles ? `[${handleForEntity(handles, ally.id)}]` : "",
        compactText(ally.name),
        `L${Math.max(1, ally.level)} ${build}`,
        `HP=${ally.hp}/${calculated.maxHp} ${healthWord(ally.hp, calculated.maxHp, ally.deathSaves)}`,
        `AC=${calculated.armorClass}`,
        position(pc, ally),
        statuses ? `effects=${statuses}` : "",
      ]
        .filter(Boolean)
        .join("|");
    })
    .sort();
  return [
    "PARTY|allies you can see and speak with; you never act or speak for them",
    ...lines,
  ].join("\n");
}

export interface SceneContextInput {
  pc: PC;
  party: PC[];
  tokens: MapToken[];
  lighting: EnvironmentLighting;
  weather: EnvironmentWeather;
  environment: Environment | null;
  perceptionRadius: number;
  rules: RuleDefinition[];
  libraryItems: LibraryItem[];
  handles?: EntityHandles;
}

const LIGHTING_HINT: Record<EnvironmentLighting, string> = {
  dawn: "pale rose light; long cool shadows",
  sunrise: "low golden sun; glare from the east",
  morning: "clear bright light, easy to read faces",
  noon: "high sun; little shade unless you make it",
  midday: "brightest overhead sun; colours stay readable",
  dusk: "long shadows; detail fades at distance",
  twilight: "the last violet light; edges go soft",
  night: "you see little beyond a short reach unless you have darkvision",
  midnight: "true dark; only stars, lamps, or darkvision help",
};

const WEATHER_HINT: Record<EnvironmentWeather, string> = {
  clear: "still air, no precipitation",
  "dust-storm": "choking grit on the wind; vision and breath suffer",
  raining: "steady rain; surfaces slick, sound muffled",
  windy: "a stiff wind tugs at cloaks and speech",
  "heavy-wind": "a hard gale; hard to hear, harder to keep footing",
  thunderstorm: "howling wind and thunder; lightning in the clouds",
  storm: "rain and thunder together",
  "heavy-storm": "driving rain, thunder, and a violent sky",
  "heavy-rain": "a downpour that sheets off every surface",
};

function visibleStatuses(
  statuses: { name: string; kind: string; effectId?: string }[]
): string {
  return statusList(
    statuses.filter((status) => {
      const id = (status.effectId ?? status.name).toLowerCase();
      return id !== "hidden" && id !== "invisible";
    })
  );
}

export function observedPresence(token: MapToken): string {
  if (token.kind === "object") {
    return `${compactText(token.size)} object`;
  }
  const relation =
    token.stance === "ally"
      ? "companion"
      : token.stance === "friendly"
        ? "bystander"
        : "foe";
  return `${compactText(token.size)} ${compactText(token.creatureType)} ${relation}`;
}

/**
 * The character's perception bubble: place, light, and the creatures and
 * objects close enough to matter, ordered nearest first.
 */
export function compactSceneContext(input: SceneContextInput): string {
  const {
    pc,
    party,
    tokens,
    lighting,
    weather,
    environment,
    perceptionRadius,
    rules,
    libraryItems,
    handles,
  } = input;
  const self = center(pc);
  const header = [
    `SCENE|place=${compactText(environment?.name ?? "") || "unmapped ground"}`,
    `light=${ENVIRONMENT_LIGHTING_LABELS[lighting] ?? lighting} (${LIGHTING_HINT[lighting] ?? "normal sight"})`,
    `weather=${ENVIRONMENT_WEATHER_LABELS[weather] ?? weather} (${WEATHER_HINT[weather] ?? "ordinary air"})`,
    `you=${Math.round(self.x)},${Math.round(self.y)}`,
    `awareness=${perceptionRadius}ft`,
  ].join(";");

  const perceived = tokens.filter((token) =>
    observerCanPerceive(pc, token, rules, libraryItems, perceptionRadius)
  );
  const ranked = perceived
    .map((token) => ({ token, feet: distanceFeet(pc, token) }))
    .filter((entry) => Number.isFinite(entry.feet))
    .sort((a, b) => a.feet - b.feet);
  const near = ranked.filter((entry) => entry.feet <= perceptionRadius);
  const far = ranked.filter((entry) => entry.feet > perceptionRadius);

  const lines = [header];
  const notes = clip(environment?.notes ?? "", 320);
  if (notes) lines.push(`PLACE|${notes}`);

  if (near.length) {
    lines.push("NEAR|what you can make out right now");
    for (const { token } of near) {
      const statuses = visibleStatuses(token.statuses);
      lines.push(
        [
          handles ? `[${handleForEntity(handles, token.id)}]` : "",
          compactText(tokenDisplayName(token)),
          observedPresence(token),
          position(pc, token),
          token.kind === "object" ? "" : healthWord(token.hp, token.maxHp, token.deathSaves),
          statuses ? `effects=${statuses}` : "",
        ]
          .filter(Boolean)
          .join("|")
      );
    }
  } else {
    lines.push("NEAR|nothing within your awareness");
  }

  if (far.length) {
    const names = far
      .slice(0, 6)
      .map(({ token, feet }) => `${compactText(tokenDisplayName(token))} ~${feet}ft`)
      .join(";");
    lines.push(
      `FAR|shapes too distant to read${far.length > 6 ? ` (${far.length} total)` : ""}|${names}`
    );
  }

  const hiddenCompanions = party.filter(
    (member) =>
      member.id !== pc.id &&
      !observerCanPerceive(pc, member, rules, libraryItems, perceptionRadius)
  );
  if (hiddenCompanions.length) {
    lines.push("PARTY-GAP|you cannot currently see some companions");
  }

  return lines.join("\n");
}

interface LoreCandidate {
  id: string;
  keys: string[];
  text: string;
  priority: number;
}

export interface LoreRetrieval {
  text: string;
  entries: number;
  tokens: number;
}

function normalizeKey(value: string): string {
  return compactText(value).toLowerCase();
}

/** Words plus naive singular forms, so "goblins" still matches "Goblin". */
function scanVocabulary(text: string): Set<string> {
  const words = text.toLowerCase().match(/[a-z0-9'-]+/g) ?? [];
  const vocabulary = new Set<string>();
  for (const word of words) {
    vocabulary.add(word);
    if (word.endsWith("es") && word.length > 4) vocabulary.add(word.slice(0, -2));
    if (word.endsWith("s") && word.length > 3) vocabulary.add(word.slice(0, -1));
  }
  return vocabulary;
}

function keyMatches(key: string, vocabulary: Set<string>, haystack: string): boolean {
  if (key.length < 3) return false;
  return key.includes(" ") ? haystack.includes(key) : vocabulary.has(key);
}

export interface LoreRetrievalInput {
  pc: PC;
  log: LogEntry[];
  tokens: MapToken[];
  rules: RuleDefinition[];
  libraryItems: LibraryItem[];
  environments: Environment[];
  activeEnvironmentId: string | null;
  perceptionRadius: number;
  scanDepth: number;
  budget: number;
}

/**
 * Keyword-triggered lookup over rules, items, creatures, and places, capped by a
 * token budget. Only what this moment actually mentions is injected, and never
 * anything the character sheet already carries.
 */
export function retrieveWorldInfo(input: LoreRetrievalInput): LoreRetrieval {
  const {
    pc,
    log,
    tokens,
    rules,
    libraryItems,
    environments,
    activeEnvironmentId,
    perceptionRadius,
    scanDepth,
    budget,
  } = input;
  if (budget <= 0) return { text: "", entries: 0, tokens: 0 };

  const recent = log.filter(isTableEntry).slice(-Math.max(1, scanDepth));
  const nearbyTokens = tokens.filter(
    (token) =>
      distanceFeet(pc, token) <= perceptionRadius &&
      observerCanPerceive(pc, token, rules, libraryItems, perceptionRadius)
  );
  const scanSource = [
    ...recent.map((entry) => `${entry.author} ${entry.text}`),
    ...nearbyTokens.map((token) => tokenDisplayName(token)),
  ].join("\n");
  const haystack = scanSource.toLowerCase();
  const vocabulary = scanVocabulary(scanSource);
  if (!vocabulary.size) return { text: "", entries: 0, tokens: 0 };

  const ownRuleIds = new Set(activeCreatureRules(pc, rules).map((rule) => rule.id));
  const ownItemIds = new Set(
    pc.inventory.map((item) => item.libraryItemId).filter(Boolean) as string[]
  );

  const candidates: LoreCandidate[] = [];

  for (const token of nearbyTokens) {
    const detail = [
      clip(token.notes, 200),
      token.traits
        .map((trait) => `${compactText(trait.name)}: ${compactText(trait.description)}`)
        .filter(Boolean)
        .join("; "),
    ]
      .filter(Boolean)
      .join(" ");
    if (!detail) continue;
    candidates.push({
      id: `token-${token.id}`,
      keys: [normalizeKey(token.name), normalizeKey(token.givenName)].filter(Boolean),
      text: `CREATURE ${compactText(tokenDisplayName(token))} (${token.kind}): ${detail}`,
      priority: 4,
    });
  }

  for (const environment of environments) {
    if (environment.id === activeEnvironmentId) continue;
    const notes = clip(environment.notes, 240);
    if (!notes) continue;
    candidates.push({
      id: `env-${environment.id}`,
      keys: [normalizeKey(environment.name)].filter(Boolean),
      text: `PLACE ${compactText(environment.name)}: ${notes}`,
      priority: 3,
    });
  }

  for (const rule of rules) {
    if (ownRuleIds.has(rule.id)) continue;
    const features = rule.features
      .map(
        (feature) =>
          `${compactText(feature.name)}${feature.effect ? `=${compactText(feature.effect)}` : ""}`
      )
      .filter(Boolean);
    const detail = features.length ? features.join(";") : clip(rule.notes, 200);
    if (!detail) continue;
    candidates.push({
      id: `rule-${rule.id}`,
      keys: [
        normalizeKey(rule.name),
        ...rule.features.map((feature) => normalizeKey(feature.name)),
      ].filter(Boolean),
      text: `RULE ${compactText(rule.name)} (${rule.kind}): ${clip(detail, 320)}`,
      priority: 2,
    });
  }

  for (const item of libraryItems) {
    if (ownItemIds.has(item.id)) continue;
    const mechanics = itemLoreText(item, libraryItems);
    if (!mechanics) continue;
    candidates.push({
      id: `item-${item.id}`,
      keys: [normalizeKey(item.name)].filter(Boolean),
      text: `ITEM ${compactText(item.name)} (${item.category}): ${clip(mechanics, 240)}`,
      priority: 1,
    });
  }

  const matched = candidates
    .filter((candidate) =>
      candidate.keys.some((key) => keyMatches(key, vocabulary, haystack))
    )
    .sort(
      (a, b) => b.priority - a.priority || a.text.localeCompare(b.text)
    );

  const chosen: string[] = [];
  let used = 0;
  for (const candidate of matched) {
    const cost = estimateTokens(candidate.text);
    if (used + cost > budget) continue;
    chosen.push(candidate.text);
    used += cost;
  }

  if (!chosen.length) return { text: "", entries: 0, tokens: 0 };
  return {
    text: ["REFERENCE|looked up because this moment mentions it", ...chosen].join("\n"),
    entries: chosen.length,
    tokens: used,
  };
}

export function formatSessionMemory(memory: SessionMemory): string {
  const bullets = memory.bullets.map(compactText).filter(Boolean);
  if (!bullets.length) return "";
  return [
    "MEMORY|established earlier this session, oldest first",
    ...bullets.map((bullet) => `- ${bullet}`),
  ].join("\n");
}

/**
 * App notices such as connection errors are addressed to the Game Master, not
 * to the characters, so they never enter a prompt. Dice results do.
 */
export function isTableEntry(entry: LogEntry): boolean {
  return !(entry.role === "system" && entry.author === "System");
}

/** Verbatim tail of the console, newest last, from this character's viewpoint. */
export function sceneTranscript(log: LogEntry[], pc: PC, contextWindow: number): string {
  const recent = log.filter(isTableEntry).slice(-Math.max(1, contextWindow));
  if (!recent.length) return "(The session is just beginning.)";
  return recent
    .map((entry) => {
      const who =
        entry.role === "gm"
          ? "GM"
          : entry.authorId === pc.id
            ? `${entry.author} (you)`
            : entry.author;
      return `${who}: ${entry.text}`;
    })
    .join("\n");
}

/** Console entries old enough to belong in memory but not yet folded in. */
export function pendingMemoryCount(
  log: LogEntry[],
  memory: SessionMemory,
  contextWindow: number
): number {
  const foldable = Math.max(0, log.length - Math.max(1, contextWindow));
  return Math.max(0, foldable - memory.coveredCount);
}

/**
 * Turn-order awareness so a character knows whether it is acting now and what
 * it has left to spend. Omitted entirely outside of combat.
 */
export function compactCombatContext(input: {
  pc: PC;
  party: PC[];
  tokens: MapToken[];
  combat: CombatState | null;
  rules: RuleDefinition[];
  libraryItems: LibraryItem[];
}): string {
  const { pc, party, tokens, combat, rules, libraryItems } = input;
  if (!combat?.combatants.length) return "";

  const nameOf = (combatant: Combatant): string => {
    if (combatant.id === pc.id) return `${pc.name} (you)`;
    const ally = party.find((entry) => entry.id === combatant.id);
    if (ally) return ally.name;
    const token = tokens.find((entry) => entry.id === combatant.id);
    return token ? tokenDisplayName(token) : "unknown";
  };

  const active = activeCombatant(combat);
  const lines = [
    [
      `COMBAT|round=${combat.round}`,
      `acting=${active ? nameOf(active) : "nobody"}`,
      `order=${combat.combatants.map(nameOf).join(" > ")}`,
    ].join(";"),
  ];

  const mine = combat.combatants.find((entry) => entry.id === pc.id);
  if (!mine) {
    lines.push("TURN|you are not in this fight; stay out of the initiative order");
    return lines.join("\n");
  }
  if (active?.id !== pc.id) {
    lines.push("TURN|not your turn yet; react briefly and wait for your initiative");
    return lines.join("\n");
  }
  const budget = movementBudget(mine, combatantSpeed(pc, rules, libraryItems));
  lines.push(
    [
      "TURN|yours now",
      `movement=${budget.remaining}ft of ${budget.total}ft left`,
      `action=${mine.action ? "spent" : "available"}`,
      `bonus=${mine.bonusAction ? "spent" : "available"}`,
      `reaction=${mine.reaction ? "spent" : "available"}`,
    ].join(";")
  );
  return lines.join("\n");
}

export interface PCContextInput {
  pc: PC;
  party: PC[];
  log: LogEntry[];
  settings: AISettings;
  rules: RuleDefinition[];
  libraryItems: LibraryItem[];
  tokens: MapToken[];
  lighting: EnvironmentLighting;
  weather: EnvironmentWeather;
  environments: Environment[];
  activeEnvironmentId: string | null;
  memory: SessionMemory;
  combat?: CombatState | null;
  handles?: EntityHandles;
  useSheetTools?: boolean;
}

export interface PCPrompt {
  system: string;
  user: string;
  estimatedTokens: number;
  loreEntries: number;
}

/**
 * Assembles one character's prompt in layers, deliberately positioned: identity
 * and sheet lead the system message, the live scene and the turn cue close the
 * user message, and retrieved lookups sit in between under a token budget.
 */
export function buildPCPrompt(input: PCContextInput): PCPrompt {
  const {
    pc,
    party,
    log,
    settings,
    rules,
    libraryItems,
    tokens,
    lighting,
    weather,
    environments,
    activeEnvironmentId,
    memory,
  } = input;
  const handles = input.handles ?? createEntityHandles(pc, party, tokens);
  const environment =
    environments.find((entry) => entry.id === activeEnvironmentId) ?? null;
  const knowledge = compactText(pc.knowledge ?? "");
  const extra = compactText(settings.extraInstructions);
  const sheetSections = characterSheetSections(pc, rules, libraryItems);
  const sheet = input.useSheetTools
    ? [
        sheetSections.summary,
        sheetSections.vitals,
        sheetSections.personality,
        "SHEET|Use get_my_sheet, get_inventory, get_action_options, or get_check_modifier for exact detail.",
      ]
        .filter(Boolean)
        .join("\n")
    : compactCharacterContext(pc, rules, libraryItems);

  const system = [
    [
      `You are roleplaying ${pc.name}, a player character in a tabletop roleplaying session run by a human Game Master.`,
      `You control ${pc.name} and nobody else. The GM controls the world, every other creature, and the outcome of every action.`,
    ].join("\n"),
    `PERSONALITY:\n${pc.personality || "(None recorded; play them straight and consistent.)"}`,
    `YOUR CHARACTER SHEET:\n${sheet}`,
    `RULES OF PLAY:\n${CORE_RULES_CARD}`,
    knowledge ? `WHAT YOU ALREADY KNOW (private to you):\n${knowledge}` : "",
    pc.goal?.trim() ? `CURRENT GOAL (private to you):\n${compactText(pc.goal)}` : "",
    extra ? `GAME MASTER INSTRUCTIONS:\n${extra}` : "",
    [
      "HOW TO ANSWER:",
      `- Stay fully in character as ${pc.name} and speak in their voice.`,
      `- Reply with what ${pc.name} says and does, in 1-4 sentences.`,
      "- Use only what your sheet, the scene, and the console history support. If you do not know something, act like someone who does not know it.",
      "- Never narrate outcomes, damage, dice results, or how anyone else reacts; the GM decides all of that.",
      "- Never speak or act for the GM, another party member, or any other creature.",
      "- To attempt something uncertain, say what you try and leave the roll to the GM.",
      "- Wrap physical actions in *asterisks*, for example *draws sword*. Plain prose otherwise.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");

  const lore = retrieveWorldInfo({
    pc,
    log,
    tokens,
    rules,
    libraryItems,
    environments,
    activeEnvironmentId,
    perceptionRadius: settings.perceptionRadius,
    scanDepth: Math.min(8, Math.max(2, settings.contextWindow)),
    budget: settings.loreBudget,
  });

  const user = [
    settings.memoryEnabled ? formatSessionMemory(memory) : "",
    compactPartyRoster(pc, party, rules, libraryItems, settings.perceptionRadius, handles),
    compactSceneContext({
      pc,
      party,
      tokens,
      lighting,
      weather,
      environment,
      perceptionRadius: settings.perceptionRadius,
      rules,
      libraryItems,
      handles,
    }),
    compactCombatContext({
      pc,
      party,
      tokens,
      combat: input.combat ?? null,
      rules,
      libraryItems,
    }),
    lore.text,
    `CONSOLE|most recent exchanges, newest last\n${sceneTranscript(log, pc, settings.contextWindow)}`,
    `It is ${pc.name}'s moment to react. What do you say or do?`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    system,
    user,
    estimatedTokens: estimateTokens(system) + estimateTokens(user),
    loreEntries: lore.entries,
  };
}

export interface SessionMemoryPrompt {
  system: string;
  user: string;
  throughLogId: string;
  coveredCount: number;
}

/**
 * Builds the summarizer prompt for console history that has aged out of the
 * verbatim window, merging it into the existing digest.
 */
export function buildSessionMemoryPrompt(
  log: LogEntry[],
  memory: SessionMemory,
  settings: AISettings,
  campaignName: string
): SessionMemoryPrompt | null {
  const foldable = Math.max(0, log.length - Math.max(1, settings.contextWindow));
  if (foldable <= memory.coveredCount) return null;
  const fresh = log.slice(memory.coveredCount, foldable);
  const worthKeeping = fresh.filter(isTableEntry);
  if (!worthKeeping.length) return null;
  const last = fresh[fresh.length - 1];
  const transcript = worthKeeping
    .map((entry) => `${entry.role === "gm" ? "GM" : entry.author}: ${entry.text}`)
    .join("\n");
  const priorBullets = memory.bullets.map(compactText).filter(Boolean);

  return {
    system: [
      "You keep the running record for a tabletop roleplaying session.",
      `Merge the earlier notes with the new events into at most ${settings.memoryBullets} short bullets.`,
      "Keep what still matters for future scenes: decisions, promises, injuries, loot, names, destinations, unresolved threats, and how people feel about the party.",
      "Drop small talk, dice totals, and anything already superseded.",
      "Write each bullet as one plain sentence, past tense, no numbering and no commentary.",
      "Output only the bullets, one per line, each starting with '- '.",
    ].join("\n"),
    user: [
      `CAMPAIGN: ${campaignName}`,
      "",
      priorBullets.length
        ? `EARLIER NOTES:\n${priorBullets.map((bullet) => `- ${bullet}`).join("\n")}`
        : "EARLIER NOTES: (none yet)",
      "",
      `NEW EVENTS:\n${transcript}`,
    ].join("\n"),
    throughLogId: last.id,
    coveredCount: foldable,
  };
}

/** Parses the summarizer reply back into clean bullets. */
export function parseMemoryBullets(text: string, limit: number): string[] {
  return text
    .split("\n")
    .map((line) => compactText(line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "")))
    .filter((line) => line.length > 1)
    .slice(0, Math.max(1, limit));
}
