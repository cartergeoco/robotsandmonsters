import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  createCampaignPersistStorage,
  campaignStorageKey,
  markCampaignStorageReady,
  readSceneView,
  setCampaignWriteDelay,
  writeSceneView,
} from "./persistStorage";
import type {
  ActionSlot,
  AISettings,
  AreaPresence,
  Combatant,
  CombatState,
  CreatureMechanics,
  Environment,
  EnvironmentLighting,
  EnvironmentTrack,
  EnvironmentWeather,
  GameplaySettings,
  LightingTransition,
  WeatherTransition,
  LibraryItem,
  LogEntry,
  MapBackground,
  MapCamera,
  MapToken,
  PC,
  RuleDefinition,
  SaveArea,
  SceneTransition,
  SessionMemory,
  TokenBlueprint,
  CreatureSheen,
  CreatureSheenKind,
  StatusEffect,
  TokenCell,
  TokenFloater,
  TokenIntent,
  TokenKind,
  UISettings,
} from "./types";
import {
  CREATURE_SHEEN_MS,
  DEFAULT_ABILITIES,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GAMEPLAY_SETTINGS,
  DEFAULT_SESSION_MEMORY,
  DEFAULT_UI_SETTINGS,
  DEFAULT_VISUAL_SCALE,
  PC_COLORS,
  LIGHTING_STEP_MS,
  SCENE_TRANSITION_MS,
  TOKEN_FLOATER_MS,
  creatureFeedbackFloater,
  emptyDeathSaves,
  normalizeDeathSaves,
  lightingCyclePath,
  normalizeItemRarity,
  normalizeGameplaySettings,
  normalizeLighting,
  normalizeWeather,
  STATUS_EFFECT_PRESETS,
  assignEquipmentSlots,
  calculateCreatureStats,
  cloneEnvironmentTrack,
  cloneSaveArea,
  createSaveArea,
  defaultStanceForKind,
  inventoryFromKit,
  normalizeUISettings,
  normalizeSaveArea,
  normalizeVisualScale,
  rectangularTokenBounds,
  resolvedCreatureProfile,
  cloneStatBlock,
  createStatBlock,
  type StatBlock,
} from "./types";
import { PREMADE_LIBRARY_ITEMS } from "./itemCatalog";
import { PREMADE_RULES } from "./ruleCatalog";
import { normalizeAISettings } from "./aiProviders";
import { applyHpChange, creatureUsesDeathSaves, isDead } from "./deathSaves";
import { applyFullRest, applyShortRest, classHitDie } from "./rests";
import { resolveSceneTriggers } from "./saves";
import {
  activeCombatant,
  advanceTurn,
  combatantSpeed,
  createCombatant,
  focusCreature,
  insertInOrder,
  movementBudget,
  normalizeCombat,
  removeFromOrder,
  resetTurnBudget,
  sortCombatants,
} from "./combat";
import { applyDeathSaveRoll, isDying } from "./deathSaves";
import { d20FromResult, requestD20Roll } from "./diceRolls";
import { distanceFeet } from "./perception";

const uid = () => crypto.randomUUID();
const boundedLog = (entries: LogEntry[], limit: number) =>
  entries.slice(-Math.max(100, limit || DEFAULT_UI_SETTINGS.maxConsoleEntries));
const normalizeTokenIntent = (intent: TokenIntent): TokenIntent => ({
  ...intent,
  autonomy: intent.autonomy === "propose" ? "propose" : "announce",
  status: "pending",
});
const LEGACY_PREMADE_ITEM_IDS = [
  "item-dagger",
  "item-shortbow",
  "item-spear",
  "item-shield",
  "item-leather-armor",
  "item-trade-goods",
] as const;
const LEGACY_PREMADE_RULE_IDS = [
  "race-human",
  "race-elf",
  "race-dwarf",
  "subrace-high-elf",
  "subrace-hill-dwarf",
  "class-fighter",
  "class-rogue",
  "class-wizard",
  "subclass-champion",
  "subclass-thief",
  "subclass-evocation",
] as const;

const cloneLibraryItem = (item: LibraryItem): LibraryItem => ({
  ...item,
  rarity: normalizeItemRarity(item.rarity),
  properties: [...(item.properties ?? [])],
  actions: [...(item.actions ?? [])],
  contains: [...(item.contains ?? [])],
});

const copyMapToken = (token: MapToken, freshIds = false): MapToken => ({
  ...token,
  id: freshIds ? uid() : token.id,
  skills: token.skills.map((skill) => ({ ...skill, id: freshIds ? uid() : skill.id })),
  traits: token.traits.map((trait) => ({ ...trait, id: freshIds ? uid() : trait.id })),
  features: token.features.map((feature) => ({ ...feature, id: freshIds ? uid() : feature.id })),
  statuses: token.statuses.map((status) => ({
    ...status,
    id: freshIds ? uid() : status.id,
  })),
  ruleChoices: Object.fromEntries(
    Object.entries(token.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
  ),
  abilityImprovements: (token.abilityImprovements ?? []).map((improvement) => ({
    ...improvement,
    increases: { ...improvement.increases },
  })),
  inventory: token.inventory.map((item) => ({
    ...item,
    id: freshIds ? uid() : item.id,
  })),
  wallet: { ...token.wallet },
  statBlock: token.statBlock ? cloneStatBlock(token.statBlock) : null,
  bounds: token.bounds.map((cell) => ({ ...cell })),
});

const cloneMapToken = (token: MapToken): MapToken => copyMapToken(token, true);

const cloneEnvironment = (environment: Environment): Environment => ({
  ...environment,
  lighting: normalizeLighting(environment.lighting),
  weather: normalizeWeather(environment.weather),
  background: environment.background ? { ...environment.background } : null,
  music: cloneEnvironmentTrack(environment.music),
  ambience: cloneEnvironmentTrack(environment.ambience),
  battleMusic: cloneEnvironmentTrack(environment.battleMusic),
  tokens: environment.tokens.map(cloneMapToken),
  saveAreas: (environment.saveAreas ?? []).map(cloneSaveArea),
});

function omitLegacyDiceLook(
  ui: (Partial<UISettings> & { diceLook?: unknown; theme?: string }) | undefined
): Partial<UISettings> & { theme?: string; palette?: string } {
  if (!ui) return {};
  const { diceLook: _removed, ...rest } = ui;
  return rest;
}

function withTokenLogistics<T extends MapToken | TokenBlueprint>(value: T): T {
  return {
    ...value,
    stance: value.stance ?? defaultStanceForKind(value.kind),
    visualScale: normalizeVisualScale(value.visualScale ?? DEFAULT_VISUAL_SCALE),
    ...("hidden" in value
      ? {
          hidden: Boolean(value.hidden),
          stealthTotal:
            typeof value.stealthTotal === "number" ? value.stealthTotal : null,
        }
      : {}),
  };
}

function withPcLogistics(pc: PC): PC {
  return {
    ...pc,
    visualScale: normalizeVisualScale(pc.visualScale ?? DEFAULT_VISUAL_SCALE),
    hidden: Boolean(pc.hidden),
    stealthTotal: typeof pc.stealthTotal === "number" ? pc.stealthTotal : null,
  };
}

function pruneCreatureSheens(sheens: CreatureSheen[], now = Date.now()): CreatureSheen[] {
  return sheens.filter((sheen) => now - sheen.bornAt < CREATURE_SHEEN_MS);
}

function appendCreatureSheens(
  sheens: CreatureSheen[],
  added: Array<{ creatureId: string; kind: CreatureSheenKind }>,
  now = Date.now()
): CreatureSheen[] {
  const next = pruneCreatureSheens(sheens, now);
  for (const entry of added) {
    next.push({ id: uid(), creatureId: entry.creatureId, kind: entry.kind, bornAt: now });
  }
  return next;
}

function appendTokenFloaters(
  floaters: TokenFloater[],
  added: Array<Omit<TokenFloater, "id" | "bornAt">>,
  now = Date.now()
): TokenFloater[] {
  const next = floaters.filter((entry) => now - entry.bornAt < TOKEN_FLOATER_MS);
  for (const entry of added) {
    next.push({ ...entry, id: uid(), bornAt: now });
  }
  return next;
}

function statusFeedbackFromPatch(
  creatureId: string,
  previous: StatusEffect[] | undefined,
  next: StatusEffect[] | undefined,
  patch: { statuses?: StatusEffect[]; hp?: number }
): {
  sheens: Array<{ creatureId: string; kind: CreatureSheenKind }>;
  floaters: Array<Omit<TokenFloater, "id" | "bornAt">>;
} {
  if (!patch.statuses || patch.hp !== undefined) {
    return { sheens: [], floaters: [] };
  }
  const priorIds = new Set((previous ?? []).map((status) => status.id));
  const added = (next ?? []).filter(
    (status) =>
      !priorIds.has(status.id) && (status.kind === "buff" || status.kind === "debuff")
  );
  const latest = added[added.length - 1];
  if (!latest) return { sheens: [], floaters: [] };
  return {
    sheens: [{ creatureId, kind: latest.kind }],
    floaters: added.map((status) =>
      creatureFeedbackFloater(creatureId, status.kind, status.name.toUpperCase())
    ),
  };
}

function reducedMotion(motion: UISettings["motion"]): boolean {
  if (motion === "reduced") return true;
  if (motion === "system" && typeof window !== "undefined") {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }
  return false;
}

function sceneDurationMs(motion: UISettings["motion"]): number {
  return reducedMotion(motion) ? 80 : SCENE_TRANSITION_MS;
}

function lightingDurationMs(
  motion: UISettings["motion"],
  pathLength: number
): number {
  if (reducedMotion(motion)) return 80;
  return Math.max(80, LIGHTING_STEP_MS * Math.max(1, pathLength - 1));
}

function displayedLighting(
  lighting: EnvironmentLighting,
  transition: LightingTransition | null,
  now = Date.now()
): EnvironmentLighting {
  if (!transition?.path.length) return lighting;
  const progress = Math.max(
    0,
    Math.min(1, (now - transition.startedAt) / Math.max(1, transition.durationMs))
  );
  const segments = Math.max(1, transition.path.length - 1);
  const index = Math.min(
    transition.path.length - 1,
    Math.round(progress * segments)
  );
  return transition.path[index] ?? lighting;
}

const cloneRule = (rule: RuleDefinition): RuleDefinition => ({
  ...rule,
  abilityScoreImprovementLevels: [...(rule.abilityScoreImprovementLevels ?? [])],
  resourceTracks: (rule.resourceTracks ?? []).map((track) => ({
    ...track,
    values: track.values.map((value) => ({ ...value })),
  })),
  spellcasting: rule.spellcasting
    ? {
        ...rule.spellcasting,
        slotsByLevel: rule.spellcasting.slotsByLevel.map((row) => [...row]),
        slotLevels: rule.spellcasting.slotLevels
          ? [...rule.spellcasting.slotLevels]
          : undefined,
        cantripsKnown: rule.spellcasting.cantripsKnown
          ? [...rule.spellcasting.cantripsKnown]
          : undefined,
        spellsKnown: rule.spellcasting.spellsKnown
          ? [...rule.spellcasting.spellsKnown]
          : undefined,
      }
    : null,
  abilityBonuses: { ...rule.abilityBonuses },
  saveBonuses: { ...rule.saveBonuses },
  saveProficiencies: [...rule.saveProficiencies],
  proficiencies: [...rule.proficiencies],
  skillBonuses: rule.skillBonuses.map((skill) => ({ ...skill })),
  senses: [...rule.senses],
  languages: [...rule.languages],
  vulnerabilities: [...rule.vulnerabilities],
  resistances: [...rule.resistances],
  damageImmunities: [...rule.damageImmunities],
  conditionImmunities: [...rule.conditionImmunities],
  specialActions: [...rule.specialActions],
  features: rule.features.map((feature) => ({
    ...feature,
    grants: feature.grants
      ? {
          expertise: feature.grants.expertise
            ? [...feature.grants.expertise]
            : undefined,
          halfProficiencyAbilities: feature.grants.halfProficiencyAbilities
            ? [...feature.grants.halfProficiencyAbilities]
            : undefined,
        }
      : undefined,
  })),
  unarmoredAcAbilities: [...rule.unarmoredAcAbilities],
  startingKit: (rule.startingKit ?? []).map((entry) => ({ ...entry })),
  choices: (rule.choices ?? []).map((choice) => ({
    ...choice,
    levelCounts: choice.levelCounts?.map((entry) => ({ ...entry })),
    options: [...choice.options],
  })),
});

function withCalculatedStats<T extends CreatureMechanics>(
  value: T,
  rules: RuleDefinition[],
  items: LibraryItem[]
): T {
  if ("kind" in value && value.kind === "object" && !value.statBlock) return value;
  const calculated = calculateCreatureStats(value, rules, items);
  const profile = resolvedCreatureProfile(value, rules);
  return {
    ...value,
    ...profile,
    maxHp: calculated.maxHp,
    ac: calculated.armorClass,
    deathSaves: normalizeDeathSaves(value.deathSaves),
  };
}

function applyCreaturePatch<T extends CreatureMechanics>(
  current: T,
  patch: Partial<T>,
  rules: RuleDefinition[],
  items: LibraryItem[]
): T {
  const merged = withCalculatedStats(
    { ...current, ...patch },
    rules,
    items
  );
  if (patch.hp === undefined || patch.deathSaves !== undefined) return merged;
  if (patch.hp === current.hp) return merged;
  return applyHpChange(
    {
      ...merged,
      hp: current.hp,
      deathSaves: current.deathSaves,
      statuses: current.statuses,
    },
    patch.hp - current.hp,
    { usesDeathSaves: creatureUsesDeathSaves(current) }
  ).creature;
}

const COLORFREE_MIGRATION: Record<string, string> = {
  "#c9a86a": "#747d9f",
  "#8fb996": "#637c79",
  "#9a8fc2": "#777391",
  "#c98a8a": "#765462",
  "#7fa8c9": "#68758a",
  "#c9b97f": "#7f7890",
  "#a8c97f": "#6f7b83",
  "#c97fa8": "#7b687f",
  "#b0524f": "#765462",
  "#5f87a8": "#68758a",
  "#7d7a72": "#686a78",
};

interface RAMState {
  campaignName: string;
  pcs: PC[];
  tokens: MapToken[];
  customTokenBlueprints: TokenBlueprint[];
  customLibraryItems: LibraryItem[];
  ruleDefinitions: RuleDefinition[];
  environments: Environment[];
  saveAreas: SaveArea[];
  areaPresence: AreaPresence[];
  tokenFloaters: TokenFloater[];
  tokenIntents: TokenIntent[];
  creatureSheens: CreatureSheen[];
  selectedSaveAreaId: string | null;
  deletedLibraryItemIds: string[];
  deletedRuleDefinitionIds: string[];
  background: MapBackground | null;
  lighting: EnvironmentLighting;
  weather: EnvironmentWeather;
  music: EnvironmentTrack | null;
  ambience: EnvironmentTrack | null;
  battleMusic: EnvironmentTrack | null;
  /** Campaign-wide fallback used when the scene has no battle track. */
  defaultBattleMusic: EnvironmentTrack | null;
  /** Null outside of battle; presence of this slice is what "battle mode" means. */
  combat: CombatState | null;
  activeEnvironmentId: string | null;
  mapCamera: MapCamera | null;
  sceneTransition: SceneTransition | null;
  lightingTransition: LightingTransition | null;
  weatherTransition: WeatherTransition | null;
  log: LogEntry[];
  /** Digest of console history that scrolled out of the verbatim window. */
  memory: SessionMemory;
  settings: AISettings;
  gameplaySettings: GameplaySettings;
  uiSettings: UISettings;
  /** PC ids with an in-flight AI request. */
  thinking: string[];
  /** True while the session digest is being regenerated. */
  memoryBusy: boolean;
  selectedPcId: string | null;
  settingsOpen: boolean;
  tokenManagerOpen: boolean;
  tokenManagerKind: TokenKind | "all";
  tokenManagerTab: "library" | "map" | "environments";
  tokenManagerTokenId: string | null;
  activeView: "grid" | "world-map";

  setCampaignName: (name: string) => void;
  addPC: () => string;
  duplicatePC: (id: string) => void;
  levelUpParty: () => void;
  shortRestParty: () => void;
  fullRestParty: () => void;
  updatePC: (id: string, patch: Partial<PC>) => void;
  deletePC: (id: string) => void;
  selectPC: (id: string | null) => void;
  moveCreature: (id: string, isPC: boolean, x: number, y: number) => void;
  moveCreatures: (
    moves: Array<{ id: string; isPC: boolean; x: number; y: number }>
  ) => void;

  placeToken: (blueprint: TokenBlueprint) => void;
  updateToken: (id: string, patch: Partial<MapToken>) => void;
  addTokenFloater: (floater: Omit<TokenFloater, "id" | "bornAt">) => void;
  setPCIntent: (intent: Omit<TokenIntent, "id" | "createdAt" | "status">) => void;
  clearPCIntent: (creatureId: string, intentId?: string) => void;
  duplicateToken: (id: string) => void;
  deleteToken: (id: string) => void;
  addTokenBlueprint: (blueprint: TokenBlueprint) => void;
  updateTokenBlueprint: (id: string, patch: Partial<TokenBlueprint>) => void;
  deleteTokenBlueprint: (id: string) => void;
  addLibraryItem: (item: LibraryItem) => void;
  updateLibraryItem: (id: string, patch: Partial<LibraryItem>) => void;
  deleteLibraryItem: (id: string) => void;
  addRuleDefinition: (rule: RuleDefinition) => void;
  updateRuleDefinition: (id: string, patch: Partial<RuleDefinition>) => void;
  deleteRuleDefinition: (id: string) => void;
  addEnvironment: (environment: Environment) => void;
  updateEnvironment: (id: string, patch: Partial<Environment>) => void;
  deleteEnvironment: (id: string) => void;
  applyEnvironment: (id: string) => void;
  captureEnvironment: (id: string) => void;
  addSaveArea: (cells?: TokenCell[]) => string;
  updateSaveArea: (id: string, patch: Partial<SaveArea>) => void;
  deleteSaveArea: (id: string) => void;
  selectSaveArea: (id: string | null) => void;
  setSaveAreaCell: (id: string, x: number, y: number, occupied: boolean) => void;
  flushSceneTriggers: () => void;
  setLighting: (lighting: EnvironmentLighting) => void;
  setWeather: (weather: EnvironmentWeather) => void;
  setMusic: (music: EnvironmentTrack | null) => void;
  setAmbience: (ambience: EnvironmentTrack | null) => void;
  setBattleMusic: (battleMusic: EnvironmentTrack | null) => void;
  setDefaultBattleMusic: (battleMusic: EnvironmentTrack | null) => void;
  setMapCamera: (camera: MapCamera) => void;
  clearSceneTransition: () => void;
  clearLightingTransition: () => void;
  clearWeatherTransition: () => void;
  setTokenManagerOpen: (
    open: boolean,
    kind?: TokenKind | "all",
    tab?: "library" | "map" | "environments",
    tokenId?: string | null
  ) => void;

  setBackground: (bg: MapBackground | null) => void;

  addLog: (entry: Omit<LogEntry, "id" | "ts">) => void;
  clearLog: () => void;

  setMemory: (memory: SessionMemory) => void;
  setMemoryBullets: (bullets: string[]) => void;
  setMemoryBusy: (busy: boolean) => void;
  clearMemory: () => void;

  startCombat: (
    entries: Array<{ id: string; isPC: boolean; d20: number; dexMod: number }>
  ) => void;
  endCombat: () => void;
  nextTurn: () => void;
  prevTurn: () => void;
  addCombatant: (id: string, isPC: boolean, d20: number, dexMod: number) => void;
  removeCombatant: (id: string) => void;
  setInitiative: (id: string, initiative: number) => void;
  spendActionSlot: (id: string, slot: ActionSlot, spent?: boolean) => void;
  toggleDash: (id: string) => void;
  rollDeathSave: (id: string, isPC: boolean, d20: number) => void;

  setSettings: (patch: Partial<AISettings>) => void;
  setGameplaySettings: (patch: Partial<GameplaySettings>) => void;
  setUISettings: (patch: Partial<UISettings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setActiveView: (view: "grid" | "world-map") => void;
  setThinking: (pcId: string, on: boolean) => void;
}

type PersistedRAMState = Pick<
  RAMState,
  | "campaignName"
  | "pcs"
  | "tokens"
  | "customTokenBlueprints"
  | "customLibraryItems"
  | "ruleDefinitions"
  | "environments"
  | "saveAreas"
  | "areaPresence"
  | "tokenIntents"
  | "deletedLibraryItemIds"
  | "deletedRuleDefinitionIds"
  | "background"
  | "lighting"
  | "weather"
  | "music"
  | "ambience"
  | "battleMusic"
  | "defaultBattleMusic"
  | "combat"
  | "activeEnvironmentId"
  | "mapCamera"
  | "activeView"
  | "log"
  | "memory"
  | "settings"
  | "gameplaySettings"
  | "uiSettings"
>;

type LegacyPersistedRAMState = Omit<
  PersistedRAMState,
  | "settings"
  | "gameplaySettings"
  | "uiSettings"
  | "memory"
  | "tokenIntents"
  | "customTokenBlueprints"
  | "customLibraryItems"
  | "ruleDefinitions"
  | "environments"
  | "deletedLibraryItemIds"
  | "deletedRuleDefinitionIds"
  | "lighting"
  | "weather"
  | "activeEnvironmentId"
  | "mapCamera"
  | "activeView"
> & {
  settings: Partial<AISettings>;
  gameplaySettings?: Partial<GameplaySettings>;
  tokenIntents?: TokenIntent[];
  uiSettings?: Partial<UISettings>;
  memory?: Partial<SessionMemory>;
  customTokenBlueprints?: TokenBlueprint[];
  customLibraryItems?: LibraryItem[];
  ruleDefinitions?: RuleDefinition[];
  environments?: Environment[];
  saveAreas?: SaveArea[];
  areaPresence?: AreaPresence[];
  deletedLibraryItemIds?: string[];
  deletedRuleDefinitionIds?: string[];
  lighting?: EnvironmentLighting;
  weather?: EnvironmentWeather;
  music?: EnvironmentTrack | null;
  ambience?: EnvironmentTrack | null;
  battleMusic?: EnvironmentTrack | null;
  defaultBattleMusic?: EnvironmentTrack | null;
  combat?: CombatState | null;
  activeEnvironmentId?: string | null;
  mapCamera?: MapCamera | null;
  activeView?: "grid" | "world-map";
};

export const useRAM = create<RAMState>()(
  persist(
    (set, get) => {
      const snapshotScene = () => {
        const state = get();
        writeSceneView({
          lighting: state.lighting,
          weather: state.weather,
          activeEnvironmentId: state.activeEnvironmentId,
          mapCamera: state.mapCamera,
          activeView: state.activeView,
        });
      };

      const creatureById = (
        id: string,
        isPC: boolean
      ): (PC | MapToken) | undefined => {
        const state = get();
        return isPC
          ? state.pcs.find((pc) => pc.id === id)
          : state.tokens.find((token) => token.id === id);
      };

      const combatantIsDead = (combatant: Combatant): boolean => {
        const creature = creatureById(combatant.id, combatant.isPC);
        return !creature || isDead(creature);
      };

      const combatantName = (combatant: Combatant): string => {
        const creature = creatureById(combatant.id, combatant.isPC);
        if (!creature) return "Unknown";
        return "givenName" in creature && creature.givenName
          ? creature.givenName
          : creature.name;
      };

      const logCombat = (text: string) => {
        get().addLog({ role: "system", author: "Combat", text });
      };

      /** Refreshes every budget so a fight always opens on a clean first turn. */
      const openingOrder = (combatants: Combatant[]): Combatant[] =>
        sortCombatants(combatants).map(resetTurnBudget);

      /**
       * Called whenever the spotlight moves: logs the turn, pans the map, and
       * settles a dying combatant's death save when the GM asked for that.
       */
      const announceTurn = () => {
        const state = get();
        const active = activeCombatant(state.combat);
        if (!active || !state.combat) return;
        const creature = creatureById(active.id, active.isPC);
        if (!creature) return;
        logCombat(
          `Round ${state.combat.round} — ${combatantName(active)}'s turn.`
        );
        if (state.uiSettings.motion !== "reduced") focusCreature(active.id);
        if (
          state.gameplaySettings.autoDeathSaves &&
          state.gameplaySettings.combatRules !== "off" &&
          isDying(creature) &&
          creatureUsesDeathSaves(creature)
        ) {
          requestD20Roll((result) => {
            get().rollDeathSave(active.id, active.isPC, d20FromResult(result));
          });
        }
      };

      const combatantBudget = (combatant: Combatant) => {
        const creature = creatureById(combatant.id, combatant.isPC);
        if (!creature) return null;
        const state = get();
        return movementBudget(
          combatant,
          combatantSpeed(creature, state.ruleDefinitions, state.customLibraryItems)
        );
      };

      /**
       * Prices one leg of a move against the active combatant's remaining
       * speed. Only the creature whose turn it is spends movement; strict mode
       * refuses the leg outright rather than dropping the token mid-path.
       */
      const priceMovement = (
        active: Combatant | null,
        creature: PC | MapToken,
        move: { id: string; x: number; y: number },
        strict: boolean
      ): { feet: number; blocked: boolean } => {
        if (!active || active.id !== move.id) return { feet: 0, blocked: false };
        const feet = distanceFeet(creature, {
          x: move.x,
          y: move.y,
          width: creature.width,
          height: creature.height,
          bounds: creature.bounds,
        });
        if (!Number.isFinite(feet)) return { feet: 0, blocked: false };
        if (!strict) return { feet, blocked: false };
        const budget = combatantBudget(active);
        if (budget && feet > budget.remaining) {
          logCombat(
            `${combatantName(active)} cannot move ${feet} ft — only ${budget.remaining} ft left this turn.`
          );
          return { feet: 0, blocked: true };
        }
        return { feet, blocked: false };
      };

      const applySceneTriggers = () => {
        const state = get();
        const result = resolveSceneTriggers({
          pcs: state.pcs,
          tokens: state.tokens,
          saveAreas: state.saveAreas,
          areaPresence: state.areaPresence,
          tokenFloaters: state.tokenFloaters,
          rules: state.ruleDefinitions,
          items: state.customLibraryItems,
          perceptionRadius: state.settings.perceptionRadius,
        });
        if (!result.changed) return;
        set({
          pcs: result.pcs,
          tokens: result.tokens,
          areaPresence: result.areaPresence,
          tokenFloaters: result.tokenFloaters,
          creatureSheens: appendCreatureSheens(state.creatureSheens, result.statusSheens),
          log: result.logs.length
            ? boundedLog([
                ...state.log,
                ...result.logs.map((entry) => ({
                  ...entry,
                  id: uid(),
                  ts: Date.now(),
                })),
              ], state.uiSettings.maxConsoleEntries)
            : state.log,
        });
      };

      return {
      campaignName: "New Campaign",
      pcs: [],
      tokens: [],
      customTokenBlueprints: [],
      customLibraryItems: PREMADE_LIBRARY_ITEMS.map(cloneLibraryItem),
      ruleDefinitions: PREMADE_RULES.map(cloneRule),
      environments: [],
      saveAreas: [],
      areaPresence: [],
      tokenFloaters: [],
      tokenIntents: [],
      creatureSheens: [],
      selectedSaveAreaId: null,
      deletedLibraryItemIds: [],
      deletedRuleDefinitionIds: [],
      background: null,
      lighting: "noon",
      weather: "clear",
      music: null,
      ambience: null,
      battleMusic: null,
      defaultBattleMusic: null,
      combat: null,
      activeEnvironmentId: null,
      mapCamera: null,
      sceneTransition: null,
      lightingTransition: null,
      weatherTransition: null,
      log: [
        {
          id: uid(),
          ts: Date.now(),
          role: "system",
          author: "System",
          text: "Welcome, Game Master. Create a character, set the scene, and begin.",
        },
      ],
      memory: { ...DEFAULT_SESSION_MEMORY, bullets: [] },
      settings: { ...DEFAULT_AI_SETTINGS },
      gameplaySettings: { ...DEFAULT_GAMEPLAY_SETTINGS },
      uiSettings: { ...DEFAULT_UI_SETTINGS },
      thinking: [],
      memoryBusy: false,
      selectedPcId: null,
      settingsOpen: false,
      tokenManagerOpen: false,
      tokenManagerKind: "all",
      tokenManagerTab: "library",
      tokenManagerTokenId: null,
      activeView: "grid",

      setCampaignName: (name) => set({ campaignName: name }),

      addPC: () => {
        const id = uid();
        const n = get().pcs.length;
        const rules = get().ruleDefinitions;
        const items = get().customLibraryItems;
        const fighter = rules.find((rule) => rule.id === "class-fighter");
        const pc = withCalculatedStats<PC>(
          {
            id,
            name: `Adventurer ${n + 1}`,
            raceId: "race-human",
            subraceId: "",
            classId: "class-fighter",
            subclassId: "",
            backgroundId: "",
            race: "Human",
            subrace: "",
            className: "Fighter",
            subclass: "",
            backgroundName: "",
            ruleChoices: {},
            abilityImprovements: [],
            creatureType: "humanoid",
            size: "medium",
            level: 1,
            hp: 10,
            maxHp: 10,
            ac: 12,
            abilities: { ...DEFAULT_ABILITIES },
            skills: [],
            traits: [],
            features: [],
            inventory: fighter ? inventoryFromKit(fighter.startingKit, items) : [],
            wallet: { copper: 0, silver: 0, gold: 0 },
            statuses: [],
            // Player characters are built from race and class, not a stat block.
            statBlock: null,
            alignment: "True Neutral",
            personality:
              "Brave but cautious. Speaks plainly and acts decisively when the party hesitates.",
            goal: "",
            knowledge: "",
            color: PC_COLORS[n % PC_COLORS.length],
            visualScale: DEFAULT_VISUAL_SCALE,
            hidden: false,
            stealthTotal: null,
            deathSaves: emptyDeathSaves(),
            width: 1,
            height: 1,
            bounds: rectangularTokenBounds(1, 1),
            x: n * 2,
            y: 0,
          },
          rules,
          items
        );
        set({ pcs: [...get().pcs, { ...pc, hp: pc.maxHp }], selectedPcId: id });
        applySceneTriggers();
        return id;
      },

      duplicatePC: (id) => {
        const source = get().pcs.find((pc) => pc.id === id);
        if (!source) return;
        const copy: PC = {
          ...source,
          id: uid(),
          name: `${source.name} Copy`,
          x: source.x + 1,
          y: source.y + 1,
          abilities: { ...source.abilities },
          ruleChoices: Object.fromEntries(
            Object.entries(source.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
          ),
          abilityImprovements: (source.abilityImprovements ?? []).map((improvement) => ({
            ...improvement,
            increases: { ...improvement.increases },
          })),
          skills: source.skills.map((skill) => ({ ...skill, id: uid() })),
          traits: source.traits.map((trait) => ({ ...trait, id: uid() })),
          features: source.features.map((feature) => ({ ...feature, id: uid() })),
          statuses: source.statuses.map((status) => ({ ...status, id: uid() })),
          inventory: source.inventory.map((item) => ({ ...item, id: uid() })),
          wallet: { ...source.wallet },
          statBlock: source.statBlock ? cloneStatBlock(source.statBlock) : null,
          bounds: source.bounds.map((cell) => ({ ...cell })),
        };
        set({ pcs: [...get().pcs, copy], selectedPcId: copy.id });
        applySceneTriggers();
      },

      levelUpParty: () => {
        const state = get();
        const levelingPcs = state.pcs.filter((pc) => pc.level < 20);
        if (levelingPcs.length === 0) return;
        const levelingIds = new Set(levelingPcs.map((pc) => pc.id));
        const nextPcs = state.pcs.map((pc) => {
          if (!levelingIds.has(pc.id)) return pc;
          const next = withCalculatedStats(
            { ...pc, level: pc.level + 1 },
            state.ruleDefinitions,
            state.customLibraryItems
          );
          const gainedHp = Math.max(0, next.maxHp - pc.maxHp);
          return { ...next, hp: Math.min(next.maxHp, pc.hp + gainedHp) };
        });
        set({
          pcs: nextPcs,
          creatureSheens: appendCreatureSheens(
            state.creatureSheens,
            nextPcs
              .filter((pc) => levelingIds.has(pc.id))
              .map((pc) => ({ creatureId: pc.id, kind: "levelup" as const }))
          ),
          tokenFloaters: appendTokenFloaters(
            state.tokenFloaters,
            nextPcs
              .filter((pc) => levelingIds.has(pc.id))
              .map((pc) =>
                creatureFeedbackFloater(pc.id, "levelup", "LEVEL UP", `Lv ${pc.level}`)
              )
          ),
        });
      },

      shortRestParty: () => {
        const state = get();
        if (state.pcs.length === 0) return;
        const nextPcs = state.pcs.map((pc) =>
          applyShortRest(pc, classHitDie(pc, state.ruleDefinitions))
        );
        set({
          pcs: nextPcs,
          creatureSheens: appendCreatureSheens(
            state.creatureSheens,
            nextPcs.map((pc) => ({ creatureId: pc.id, kind: "buff" as const }))
          ),
          tokenFloaters: appendTokenFloaters(
            state.tokenFloaters,
            nextPcs.map((pc) => creatureFeedbackFloater(pc.id, "buff", "SHORT REST"))
          ),
          log: boundedLog(
            [
              ...state.log,
              {
                id: uid(),
                ts: Date.now(),
                role: "system",
                author: "Rest",
                text: "The party takes a short rest.",
              },
            ],
            state.uiSettings.maxConsoleEntries
          ),
        });
      },

      fullRestParty: () => {
        const state = get();
        if (state.pcs.length === 0) return;
        const nextPcs = state.pcs.map((pc) => applyFullRest(pc));
        set({
          pcs: nextPcs,
          creatureSheens: appendCreatureSheens(
            state.creatureSheens,
            nextPcs.map((pc) => ({ creatureId: pc.id, kind: "buff" as const }))
          ),
          tokenFloaters: appendTokenFloaters(
            state.tokenFloaters,
            nextPcs.map((pc) => creatureFeedbackFloater(pc.id, "buff", "FULL REST"))
          ),
          log: boundedLog(
            [
              ...state.log,
              {
                id: uid(),
                ts: Date.now(),
                role: "system",
                author: "Rest",
                text: "The party takes a full rest.",
              },
            ],
            state.uiSettings.maxConsoleEntries
          ),
        });
      },

      updatePC: (id, patch) => {
        const state = get();
        const current = state.pcs.find((pc) => pc.id === id);
        if (!current) return;
        const next = applyCreaturePatch(
          current,
          patch,
          state.ruleDefinitions,
          state.customLibraryItems
        );
        const feedback = statusFeedbackFromPatch(id, current.statuses, next.statuses, patch);
        set({
          pcs: state.pcs.map((pc) => (pc.id === id ? next : pc)),
          ...(feedback.sheens.length
            ? { creatureSheens: appendCreatureSheens(state.creatureSheens, feedback.sheens) }
            : {}),
          ...(feedback.floaters.length
            ? { tokenFloaters: appendTokenFloaters(state.tokenFloaters, feedback.floaters) }
            : {}),
        });
        applySceneTriggers();
      },

      moveCreature: (id, isPC, x, y) => {
        get().moveCreatures([{ id, isPC, x, y }]);
      },

      moveCreatures: (moves) => {
        if (!moves.length) return;
        const combatRules = get().gameplaySettings.combatRules;
        const combat = get().combat;
        const active = combatRules === "off" ? null : activeCombatant(combat);
        const strict = combatRules === "strict";
        let pcs = get().pcs;
        let tokens = get().tokens;
        let pcsChanged = false;
        let tokensChanged = false;
        let spentFeet = 0;
        for (const move of moves) {
          if (move.isPC) {
            const index = pcs.findIndex((entry) => entry.id === move.id);
            if (index < 0) continue;
            const pc = pcs[index];
            if (pc.x === move.x && pc.y === move.y) continue;
            const priced = priceMovement(active, pc, move, strict);
            if (priced.blocked) continue;
            spentFeet += priced.feet;
            if (!pcsChanged) {
              pcs = pcs.slice();
              pcsChanged = true;
            }
            pcs[index] = { ...pc, x: move.x, y: move.y };
          } else {
            const index = tokens.findIndex((entry) => entry.id === move.id);
            if (index < 0) continue;
            const token = tokens[index];
            if (token.x === move.x && token.y === move.y) continue;
            const priced = priceMovement(active, token, move, strict);
            if (priced.blocked) continue;
            spentFeet += priced.feet;
            if (!tokensChanged) {
              tokens = tokens.slice();
              tokensChanged = true;
            }
            tokens[index] = { ...token, x: move.x, y: move.y };
          }
        }
        if (!pcsChanged && !tokensChanged) return;
        const spending = active && combat && spentFeet > 0;
        set({
          ...(pcsChanged ? { pcs } : {}),
          ...(tokensChanged ? { tokens } : {}),
          ...(spending
            ? {
                combat: {
                  ...combat,
                  combatants: combat.combatants.map((entry) =>
                    entry.id === active.id
                      ? { ...entry, movementUsed: entry.movementUsed + spentFeet }
                      : entry
                  ),
                },
              }
            : {}),
        });
        if (spending && combatRules === "advisory") {
          const budget = combatantBudget(activeCombatant(get().combat)!);
          if (budget && budget.over > 0 && budget.over <= spentFeet) {
            logCombat(
              `${combatantName(active)} has moved ${budget.used} ft — ${budget.over} ft past a ${budget.total} ft budget.`
            );
          }
        }
        queueMicrotask(() => {
          requestAnimationFrame(() => applySceneTriggers());
        });
      },

      deletePC: (id) =>
        set({
          pcs: get().pcs.filter((p) => p.id !== id),
          selectedPcId: get().selectedPcId === id ? null : get().selectedPcId,
          areaPresence: get().areaPresence.filter((entry) => entry.creatureId !== id),
          tokenFloaters: get().tokenFloaters.filter((entry) => entry.creatureId !== id),
          tokenIntents: get().tokenIntents.filter((entry) => entry.creatureId !== id),
          creatureSheens: get().creatureSheens.filter((entry) => entry.creatureId !== id),
          combat: get().combat ? removeFromOrder(get().combat!, id) : null,
        }),

      selectPC: (id) => set({ selectedPcId: id }),

      placeToken: (blueprint) => {
        const kind = blueprint.kind;
        const count = get().tokens.filter((t) => t.kind === kind).length;
        const { source: _source, ...blueprintValue } = blueprint;
        const token: MapToken = {
          ...blueprintValue,
          id: uid(),
          blueprintId: blueprint.id,
          givenName: "",
          stance: blueprint.stance ?? defaultStanceForKind(kind),
          visualScale: normalizeVisualScale(
            blueprint.visualScale ?? DEFAULT_VISUAL_SCALE
          ),
          hidden: false,
          stealthTotal: null,
          deathSaves: emptyDeathSaves(),
          hp: blueprint.maxHp,
          skills: blueprint.skills.map((skill) => ({ ...skill, id: uid() })),
          traits: blueprint.traits.map((trait) => ({ ...trait, id: uid() })),
          features: blueprint.features.map((feature) => ({ ...feature, id: uid() })),
          statuses: blueprint.statuses.map((status) => ({ ...status, id: uid() })),
          ruleChoices: Object.fromEntries(
            Object.entries(blueprint.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
          ),
          abilityImprovements: (blueprint.abilityImprovements ?? []).map(
            (improvement) => ({
              ...improvement,
              increases: { ...improvement.increases },
            })
          ),
          inventory: blueprint.inventory.map((item) => ({ ...item, id: uid() })),
          wallet: { ...blueprint.wallet },
          statBlock: blueprint.statBlock ? cloneStatBlock(blueprint.statBlock) : null,
          bounds:
            blueprint.bounds?.length > 0
              ? blueprint.bounds.map((cell) => ({ ...cell }))
              : rectangularTokenBounds(blueprint.width, blueprint.height),
          x: count * 2 + 1,
          y: kind === "enemy" ? -3 : 2,
        };
        void _source;
        set({ tokens: [...get().tokens, token] });
        applySceneTriggers();
      },

      updateToken: (id, patch) => {
        const state = get();
        const current = state.tokens.find((token) => token.id === id);
        if (!current) return;
        const next = applyCreaturePatch(
          current,
          patch,
          state.ruleDefinitions,
          state.customLibraryItems
        );
        const feedback = statusFeedbackFromPatch(id, current.statuses, next.statuses, patch);
        set({
          tokens: state.tokens.map((token) => (token.id === id ? next : token)),
          ...(feedback.sheens.length
            ? { creatureSheens: appendCreatureSheens(state.creatureSheens, feedback.sheens) }
            : {}),
          ...(feedback.floaters.length
            ? { tokenFloaters: appendTokenFloaters(state.tokenFloaters, feedback.floaters) }
            : {}),
        });
        applySceneTriggers();
      },

      addTokenFloater: (floater) => {
        set({
          tokenFloaters: appendTokenFloaters(get().tokenFloaters, [floater]),
        });
      },

      setPCIntent: (intent) =>
        set({
          tokenIntents: [
            ...get().tokenIntents,
            {
              ...intent,
              id: uid(),
              status: "pending",
              createdAt: Date.now(),
            },
          ],
        }),

      clearPCIntent: (creatureId, intentId) =>
        set({
          tokenIntents: get().tokenIntents.filter(
            (entry) =>
              entry.creatureId !== creatureId ||
              (intentId !== undefined && entry.id !== intentId)
          ),
        }),

      duplicateToken: (id) => {
        const source = get().tokens.find((token) => token.id === id);
        if (!source) return;
        const copy: MapToken = {
          ...source,
          id: uid(),
          givenName: source.givenName ? `${source.givenName} Copy` : "",
          x: source.x + 1,
          y: source.y + 1,
          bounds: source.bounds.map((cell) => ({ ...cell })),
          skills: source.skills.map((skill) => ({ ...skill, id: uid() })),
          traits: source.traits.map((trait) => ({ ...trait, id: uid() })),
          features: source.features.map((feature) => ({ ...feature, id: uid() })),
          statuses: source.statuses.map((status) => ({ ...status, id: uid() })),
          ruleChoices: Object.fromEntries(
            Object.entries(source.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
          ),
          abilityImprovements: (source.abilityImprovements ?? []).map(
            (improvement) => ({
              ...improvement,
              increases: { ...improvement.increases },
            })
          ),
          inventory: source.inventory.map((item) => ({ ...item, id: uid() })),
          wallet: { ...source.wallet },
          statBlock: source.statBlock ? cloneStatBlock(source.statBlock) : null,
        };
        set({ tokens: [...get().tokens, copy] });
        applySceneTriggers();
      },

      deleteToken: (id) =>
        set({
          tokens: get().tokens.filter((t) => t.id !== id),
          areaPresence: get().areaPresence.filter((entry) => entry.creatureId !== id),
          tokenFloaters: get().tokenFloaters.filter((entry) => entry.creatureId !== id),
          creatureSheens: get().creatureSheens.filter((entry) => entry.creatureId !== id),
          combat: get().combat ? removeFromOrder(get().combat!, id) : null,
        }),

      addTokenBlueprint: (blueprint) =>
        set({ customTokenBlueprints: [...get().customTokenBlueprints, blueprint] }),

      updateTokenBlueprint: (id, patch) =>
        set({
          customTokenBlueprints: get().customTokenBlueprints.map((blueprint) =>
            blueprint.id === id
              ? withCalculatedStats(
                  { ...blueprint, ...patch },
                  get().ruleDefinitions,
                  get().customLibraryItems
                )
              : blueprint
          ),
        }),

      deleteTokenBlueprint: (id) =>
        set({
          customTokenBlueprints: get().customTokenBlueprints.filter(
            (blueprint) => blueprint.id !== id
          ),
        }),

      addLibraryItem: (item) =>
        set({
          customLibraryItems: [...get().customLibraryItems, item],
          deletedLibraryItemIds: get().deletedLibraryItemIds.filter((id) => id !== item.id),
        }),

      updateLibraryItem: (id, patch) => {
        const customLibraryItems = get().customLibraryItems.map((item) =>
          item.id === id ? { ...item, ...patch } : item
        );
        set({
          customLibraryItems,
          pcs: get().pcs.map((pc) =>
            withCalculatedStats(pc, get().ruleDefinitions, customLibraryItems)
          ),
          tokens: get().tokens.map((token) =>
            withCalculatedStats(token, get().ruleDefinitions, customLibraryItems)
          ),
          customTokenBlueprints: get().customTokenBlueprints.map((blueprint) =>
            withCalculatedStats(blueprint, get().ruleDefinitions, customLibraryItems)
          ),
        });
      },

      deleteLibraryItem: (id) => {
        const customLibraryItems = get().customLibraryItems.filter((item) => item.id !== id);
        set({
          customLibraryItems,
          deletedLibraryItemIds: PREMADE_LIBRARY_ITEMS.some((item) => item.id === id)
            ? [...new Set([...get().deletedLibraryItemIds, id])]
            : get().deletedLibraryItemIds,
          pcs: get().pcs.map((pc) =>
            withCalculatedStats(pc, get().ruleDefinitions, customLibraryItems)
          ),
          tokens: get().tokens.map((token) =>
            withCalculatedStats(token, get().ruleDefinitions, customLibraryItems)
          ),
          customTokenBlueprints: get().customTokenBlueprints.map((blueprint) =>
            withCalculatedStats(blueprint, get().ruleDefinitions, customLibraryItems)
          ),
        });
      },

      addRuleDefinition: (rule) =>
        set({
          ruleDefinitions: [...get().ruleDefinitions, rule],
          deletedRuleDefinitionIds: get().deletedRuleDefinitionIds.filter(
            (id) => id !== rule.id
          ),
        }),

      updateRuleDefinition: (id, patch) => {
        const ruleDefinitions = get().ruleDefinitions.map((rule) =>
          rule.id === id ? { ...rule, ...patch } : rule
        );
        set({
          ruleDefinitions,
          pcs: get().pcs.map((pc) =>
            withCalculatedStats(pc, ruleDefinitions, get().customLibraryItems)
          ),
          tokens: get().tokens.map((token) =>
            withCalculatedStats(token, ruleDefinitions, get().customLibraryItems)
          ),
          customTokenBlueprints: get().customTokenBlueprints.map((blueprint) =>
            withCalculatedStats(blueprint, ruleDefinitions, get().customLibraryItems)
          ),
        });
      },

      addEnvironment: (environment) =>
        set({ environments: [...get().environments, cloneEnvironment(environment)] }),

      updateEnvironment: (id, patch) =>
        set({
          environments: get().environments.map((environment) =>
            environment.id === id
              ? {
                  ...environment,
                  ...patch,
                  background:
                    patch.background !== undefined
                      ? patch.background
                        ? { ...patch.background }
                        : null
                      : environment.background
                        ? { ...environment.background }
                        : null,
                  tokens: patch.tokens
                    ? patch.tokens.map((token) => copyMapToken(token))
                    : environment.tokens,
                  saveAreas: patch.saveAreas
                    ? patch.saveAreas.map(cloneSaveArea)
                    : (environment.saveAreas ?? []).map(cloneSaveArea),
                }
              : environment
          ),
        }),

      deleteEnvironment: (id) => {
        set({
          environments: get().environments.filter((environment) => environment.id !== id),
          activeEnvironmentId:
            get().activeEnvironmentId === id ? null : get().activeEnvironmentId,
        });
        snapshotScene();
      },

      applyEnvironment: (id) => {
        const environment = get().environments.find((entry) => entry.id === id);
        if (!environment) return;
        const current = get();
        const durationMs = sceneDurationMs(current.uiSettings.motion);
        const startedAt = Date.now();
        const nextLighting = normalizeLighting(environment.lighting);
        const nextWeather = normalizeWeather(environment.weather);
        const lightingPath = lightingCyclePath(
          displayedLighting(current.lighting, current.lightingTransition),
          nextLighting
        );
        const lightingMs = lightingDurationMs(
          current.uiSettings.motion,
          lightingPath.length
        );
        const weatherChanged = nextWeather !== current.weather;
        const weatherMs = reducedMotion(current.uiSettings.motion) ? 80 : 1200;
        set({
          tokenIntents: [],
          sceneTransition: {
            startedAt,
            durationMs,
            fromLighting: current.lighting,
            fromBackground: current.background
              ? { ...current.background }
              : null,
            fromTokens: current.tokens.map((token) => copyMapToken(token)),
          },
          lightingTransition:
            lightingPath.length > 1
              ? { startedAt, durationMs: lightingMs, path: lightingPath }
              : null,
          weatherTransition: weatherChanged
            ? {
                startedAt,
                durationMs: weatherMs,
                fromWeather: current.weather,
              }
            : null,
          activeEnvironmentId: id,
          lighting: nextLighting,
          weather: nextWeather,
          background: environment.background
            ? { ...environment.background }
            : null,
          music: cloneEnvironmentTrack(environment.music),
          ambience: cloneEnvironmentTrack(environment.ambience),
          battleMusic: cloneEnvironmentTrack(environment.battleMusic),
          combat: null,
          tokens: environment.tokens.map(cloneMapToken),
          saveAreas: (environment.saveAreas ?? []).map(cloneSaveArea),
          areaPresence: [],
          tokenFloaters: [],
          creatureSheens: [],
          selectedSaveAreaId: null,
        });
        snapshotScene();
        applySceneTriggers();
        window.setTimeout(() => {
          if (get().sceneTransition?.startedAt === startedAt) {
            set({ sceneTransition: null });
          }
        }, durationMs + 80);
        if (lightingPath.length > 1) {
          window.setTimeout(() => {
            if (get().lightingTransition?.startedAt === startedAt) {
              set({ lightingTransition: null });
            }
          }, lightingMs + 80);
        }
        if (weatherChanged) {
          window.setTimeout(() => {
            if (get().weatherTransition?.startedAt === startedAt) {
              set({ weatherTransition: null });
            }
          }, weatherMs + 80);
        }
      },

      captureEnvironment: (id) => {
        const environment = get().environments.find((entry) => entry.id === id);
        if (!environment) return;
        set({
          environments: get().environments.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  lighting: get().lighting,
                  weather: get().weather,
                  background: get().background ? { ...get().background! } : null,
                  music: cloneEnvironmentTrack(get().music),
                  ambience: cloneEnvironmentTrack(get().ambience),
                  battleMusic: cloneEnvironmentTrack(get().battleMusic),
                  tokens: get().tokens.map(cloneMapToken),
                  saveAreas: get().saveAreas.map(cloneSaveArea),
                }
              : entry
          ),
          activeEnvironmentId: id,
        });
        snapshotScene();
      },

      setLighting: (lighting) => {
        const current = get();
        const next = normalizeLighting(lighting);
        const from = displayedLighting(
          current.lighting,
          current.lightingTransition
        );
        if (next === current.lighting && !current.lightingTransition) return;
        const path = lightingCyclePath(from, next);
        const startedAt = Date.now();
        const durationMs = lightingDurationMs(
          current.uiSettings.motion,
          path.length
        );
        set({
          lighting: next,
          lightingTransition:
            path.length > 1
              ? { startedAt, durationMs, path }
              : null,
        });
        snapshotScene();
        if (path.length > 1) {
          window.setTimeout(() => {
            if (get().lightingTransition?.startedAt === startedAt) {
              set({ lightingTransition: null });
            }
          }, durationMs + 80);
        }
      },

      setWeather: (weather) => {
        const current = get();
        const next = normalizeWeather(weather);
        if (next === current.weather && !current.weatherTransition) return;
        const startedAt = Date.now();
        const durationMs = reducedMotion(current.uiSettings.motion) ? 80 : 1200;
        set({
          weather: next,
          weatherTransition:
            next === current.weather
              ? null
              : { startedAt, durationMs, fromWeather: current.weather },
        });
        snapshotScene();
        if (next !== current.weather) {
          window.setTimeout(() => {
            if (get().weatherTransition?.startedAt === startedAt) {
              set({ weatherTransition: null });
            }
          }, durationMs + 80);
        }
      },

      setMusic: (music) => set({ music: cloneEnvironmentTrack(music) }),

      setAmbience: (ambience) =>
        set({ ambience: cloneEnvironmentTrack(ambience) }),

      setBattleMusic: (battleMusic) =>
        set({ battleMusic: cloneEnvironmentTrack(battleMusic) }),

      setDefaultBattleMusic: (battleMusic) =>
        set({ defaultBattleMusic: cloneEnvironmentTrack(battleMusic) }),

      addSaveArea: (cells) => {
        const origin = get().pcs[0];
        const ox = origin?.x ?? 0;
        const oy = origin?.y ?? 0;
        const fallback: TokenCell[] = [
          { x: ox, y: oy },
          { x: ox + 1, y: oy },
          { x: ox, y: oy + 1 },
          { x: ox + 1, y: oy + 1 },
        ];
        const area = createSaveArea(
          cells?.length ? cells : fallback,
          get().saveAreas.length
        );
        set({
          saveAreas: [...get().saveAreas, area],
          selectedSaveAreaId: area.id,
        });
        applySceneTriggers();
        return area.id;
      },

      updateSaveArea: (id, patch) => {
        set({
          saveAreas: get().saveAreas.map((area) =>
            area.id === id ? normalizeSaveArea({ ...area, ...patch }) : area
          ),
        });
        applySceneTriggers();
      },

      deleteSaveArea: (id) =>
        set({
          saveAreas: get().saveAreas.filter((area) => area.id !== id),
          areaPresence: get().areaPresence.filter((entry) => entry.areaId !== id),
          selectedSaveAreaId:
            get().selectedSaveAreaId === id ? null : get().selectedSaveAreaId,
        }),

      selectSaveArea: (id) => set({ selectedSaveAreaId: id }),

      setSaveAreaCell: (id, x, y, occupied) => {
        const area = get().saveAreas.find((entry) => entry.id === id);
        if (!area) return;
        const has = area.cells.some((cell) => cell.x === x && cell.y === y);
        if (has === occupied) return;
        const cells = occupied
          ? [...area.cells, { x, y }]
          : area.cells.filter((cell) => !(cell.x === x && cell.y === y));
        if (!cells.length) return;
        set({
          saveAreas: get().saveAreas.map((entry) =>
            entry.id === id ? { ...entry, cells } : entry
          ),
        });
        applySceneTriggers();
      },

      flushSceneTriggers: () => applySceneTriggers(),

      clearSceneTransition: () => set({ sceneTransition: null }),
      clearLightingTransition: () => set({ lightingTransition: null }),
      clearWeatherTransition: () => set({ weatherTransition: null }),

      setMapCamera: (mapCamera) => {
        get().mapCamera = mapCamera;
        writeSceneView({ mapCamera });
      },

      deleteRuleDefinition: (id) => {
        const deletedIds = get()
          .ruleDefinitions.filter((rule) => rule.id === id || rule.parentId === id)
          .map((rule) => rule.id)
          .filter((ruleId) => PREMADE_RULES.some((rule) => rule.id === ruleId));
        const ruleDefinitions = get().ruleDefinitions.filter(
          (rule) => rule.id !== id && rule.parentId !== id
        );
        set({
          ruleDefinitions,
          deletedRuleDefinitionIds: [
            ...new Set([...get().deletedRuleDefinitionIds, ...deletedIds]),
          ],
          pcs: get().pcs.map((pc) =>
            withCalculatedStats(pc, ruleDefinitions, get().customLibraryItems)
          ),
          tokens: get().tokens.map((token) =>
            withCalculatedStats(token, ruleDefinitions, get().customLibraryItems)
          ),
          customTokenBlueprints: get().customTokenBlueprints.map((blueprint) =>
            withCalculatedStats(blueprint, ruleDefinitions, get().customLibraryItems)
          ),
        });
      },

      setTokenManagerOpen: (open, kind = "all", tab = "library", tokenId = null) =>
        set({
          tokenManagerOpen: open,
          tokenManagerKind: kind,
          tokenManagerTab: tab,
          tokenManagerTokenId: tokenId,
        }),

      setBackground: (bg) => {
        set({ background: bg });
        snapshotScene();
      },

      addLog: (entry) =>
        set({
          log: boundedLog(
            [...get().log, { ...entry, id: uid(), ts: Date.now() }],
            get().uiSettings.maxConsoleEntries
          ),
        }),

      clearLog: () =>
        set({ log: [], memory: { ...DEFAULT_SESSION_MEMORY, bullets: [] } }),

      setMemory: (memory) => set({ memory }),

      setMemoryBullets: (bullets) =>
        set({
          memory: {
            ...get().memory,
            bullets: bullets.map((bullet) => bullet.trim()).filter(Boolean),
            updatedAt: Date.now(),
          },
        }),

      setMemoryBusy: (memoryBusy) => set({ memoryBusy }),

      /** Forgets the digest but keeps the log, so the next pass rebuilds it. */
      clearMemory: () => set({ memory: { ...DEFAULT_SESSION_MEMORY, bullets: [] } }),

      startCombat: (entries) => {
        if (!entries.length) return;
        const combatants = openingOrder(entries.map(createCombatant));
        set({
          combat: {
            round: 1,
            turnIndex: 0,
            combatants,
            startedAt: Date.now(),
          },
        });
        const order = combatants
          .map(
            (entry, index) =>
              `${index + 1}. ${combatantName(entry)} ${entry.initiative}`
          )
          .join(" · ");
        logCombat(`Initiative — ${order}`);
        announceTurn();
      },

      endCombat: () => {
        const combat = get().combat;
        if (!combat) return;
        set({ combat: null });
        logCombat(
          `Combat ended after ${combat.round} ${combat.round === 1 ? "round" : "rounds"}.`
        );
      },

      nextTurn: () => {
        const combat = get().combat;
        if (!combat) return;
        const { combat: next } = advanceTurn(combat, 1, combatantIsDead);
        set({ combat: next });
        announceTurn();
      },

      prevTurn: () => {
        const combat = get().combat;
        if (!combat) return;
        const { combat: next } = advanceTurn(combat, -1, combatantIsDead);
        set({ combat: next });
        announceTurn();
      },

      addCombatant: (id, isPC, d20, dexMod) => {
        const combat = get().combat;
        if (!combat) return;
        const combatant = createCombatant({ id, isPC, d20, dexMod });
        set({ combat: insertInOrder(combat, combatant) });
        logCombat(
          `${combatantName(combatant)} joins at initiative ${combatant.initiative}.`
        );
      },

      removeCombatant: (id) => {
        const combat = get().combat;
        if (!combat) return;
        const combatant = combat.combatants.find((entry) => entry.id === id);
        const next = removeFromOrder(combat, id);
        set({ combat: next });
        if (combatant) logCombat(`${combatantName(combatant)} leaves the fight.`);
        if (!next) logCombat("Combat ended — no combatants left.");
      },

      setInitiative: (id, initiative) => {
        const combat = get().combat;
        if (!combat) return;
        const activeId = activeCombatant(combat)?.id;
        const combatants = sortCombatants(
          combat.combatants.map((entry) =>
            entry.id === id
              ? { ...entry, initiative: Math.round(initiative) }
              : entry
          )
        );
        set({
          combat: {
            ...combat,
            combatants,
            turnIndex: activeId
              ? Math.max(
                  0,
                  combatants.findIndex((entry) => entry.id === activeId)
                )
              : combat.turnIndex,
          },
        });
      },

      spendActionSlot: (id, slot, spent) => {
        const combat = get().combat;
        if (!combat) return;
        set({
          combat: {
            ...combat,
            combatants: combat.combatants.map((entry) =>
              entry.id === id ? { ...entry, [slot]: spent ?? !entry[slot] } : entry
            ),
          },
        });
      },

      toggleDash: (id) => {
        const combat = get().combat;
        if (!combat) return;
        set({
          combat: {
            ...combat,
            combatants: combat.combatants.map((entry) =>
              entry.id === id
                ? { ...entry, dashes: entry.dashes > 0 ? 0 : 1 }
                : entry
            ),
          },
        });
      },

      rollDeathSave: (id, isPC, d20) => {
        const creature = creatureById(id, isPC);
        if (!creature) return;
        const result = applyDeathSaveRoll(creature, d20);
        const state = get();
        set(
          isPC
            ? { pcs: state.pcs.map((pc) => (pc.id === id ? (result.creature as PC) : pc)) }
            : {
                tokens: state.tokens.map((token) =>
                  token.id === id ? (result.creature as MapToken) : token
                ),
              }
        );
        get().addTokenFloater({
          creatureId: id,
          title: result.title,
          detail: result.detail,
          outcome: result.outcome,
        });
        get().addLog({
          role: "system",
          author: "Save",
          text: `${creature.name} — ${result.log}`,
        });
      },

      setSettings: (patch) => {
        set({ settings: normalizeAISettings({ ...get().settings, ...patch }) });
        if (patch.perceptionRadius !== undefined) applySceneTriggers();
      },

      setGameplaySettings: (patch) =>
        set({
          gameplaySettings: normalizeGameplaySettings({
            ...get().gameplaySettings,
            ...patch,
          }),
        }),

      setUISettings: (patch) => {
        const next = normalizeUISettings({ ...get().uiSettings, ...patch });
        set({
          uiSettings: next,
          log: boundedLog(get().log, next.maxConsoleEntries),
        });
        setCampaignWriteDelay(next.autosaveEveryMs);
      },

      setSettingsOpen: (open) => set({ settingsOpen: open }),

      setActiveView: (activeView) => {
        set({ activeView });
        snapshotScene();
      },

      setThinking: (pcId, on) =>
        set({
          thinking: on
            ? [...get().thinking, pcId]
            : get().thinking.filter((id) => id !== pcId),
        }),
      };
    },
    {
      name: campaignStorageKey(),
      storage: createCampaignPersistStorage(),
      version: 36,
      onRehydrateStorage: () => (state, error) => {
        markCampaignStorageReady();
        if (error || !state) return;
        const scene = readSceneView();
        if (!scene) return;
        useRAM.setState({
          lighting: normalizeLighting(scene.lighting ?? state.lighting),
          weather: normalizeWeather(scene.weather ?? state.weather),
          activeEnvironmentId:
            scene.activeEnvironmentId !== undefined
              ? scene.activeEnvironmentId
              : state.activeEnvironmentId,
          mapCamera: scene.mapCamera ?? state.mapCamera,
          activeView: scene.activeView ?? state.activeView,
        });
      },
      merge: (persistedState, currentState) => {
        markCampaignStorageReady();
        const persisted = (persistedState ?? {}) as Partial<PersistedRAMState>;
        const scene = readSceneView();
        return {
          ...currentState,
          ...persisted,
          lighting: normalizeLighting(
            scene?.lighting ?? persisted.lighting ?? currentState.lighting
          ),
          weather: normalizeWeather(
            scene?.weather ?? persisted.weather ?? currentState.weather
          ),
          activeEnvironmentId:
            scene && "activeEnvironmentId" in scene
              ? scene.activeEnvironmentId
              : (persisted.activeEnvironmentId ?? currentState.activeEnvironmentId),
          mapCamera: scene?.mapCamera ?? persisted.mapCamera ?? currentState.mapCamera,
          activeView: scene?.activeView ?? persisted.activeView ?? currentState.activeView,
          background: persisted.background !== undefined ? persisted.background : currentState.background,
          music: persisted.music !== undefined ? persisted.music : currentState.music,
          ambience:
            persisted.ambience !== undefined ? persisted.ambience : currentState.ambience,
          battleMusic:
            persisted.battleMusic !== undefined
              ? persisted.battleMusic
              : currentState.battleMusic,
          defaultBattleMusic:
            persisted.defaultBattleMusic !== undefined
              ? persisted.defaultBattleMusic
              : currentState.defaultBattleMusic,
          combat: normalizeCombat(persisted.combat),
          saveAreas: persisted.saveAreas ?? currentState.saveAreas,
          areaPresence: persisted.areaPresence ?? currentState.areaPresence,
          tokenIntents: (persisted.tokenIntents ?? currentState.tokenIntents).map(
            normalizeTokenIntent
          ),
          gameplaySettings: normalizeGameplaySettings(
            persisted.gameplaySettings ?? currentState.gameplaySettings
          ),
          uiSettings: normalizeUISettings(
            omitLegacyDiceLook(persisted.uiSettings ?? currentState.uiSettings)
          ),
          creatureSheens: [],
        };
      },
      migrate: (persistedState, version) => {
        let state = persistedState as LegacyPersistedRAMState;
        if (version < 2) {
          state = {
            ...state,
            pcs: (state.pcs ?? []).map((pc) => ({
              ...pc,
              color: COLORFREE_MIGRATION[pc.color.toLowerCase()] ?? pc.color,
            })),
            tokens: (state.tokens ?? []).map((token) => ({
              ...token,
              color: COLORFREE_MIGRATION[token.color.toLowerCase()] ?? token.color,
            })),
          };
        }
        if (version < 3) {
          state = {
            ...state,
            log: state.log.map((entry) =>
              entry.author === "RAM" ? { ...entry, author: "System" } : entry
            ),
          };
        }
        const ruleId = (kind: RuleDefinition["kind"], name: string | undefined) =>
          PREMADE_RULES.find(
            (rule) => rule.kind === kind && rule.name.toLowerCase() === (name ?? "").toLowerCase()
          )?.id ?? "";
        /**
         * Map tokens become stat block creatures, which is how the Monster
         * Manual describes monsters, NPCs, and objects. Anything that was
         * deliberately built from a race or class keeps that build, and player
         * characters are always character-built.
         */
        const statBlockFor = (
          value: Partial<PC | MapToken | TokenBlueprint>
        ): StatBlock | null => {
          const token = value as Partial<MapToken>;
          if (!token.kind) return null;
          if (token.statBlock) return cloneStatBlock(token.statBlock);
          if (value.raceId || value.classId) return null;
          return createStatBlock({
            alignment: token.kind === "object" ? "Unaligned" : "True Neutral",
            // Zero hit dice preserves the hit points already recorded here.
            hitDice: 0,
            speeds: { walk: token.kind === "object" ? 0 : 30 },
          });
        };
        const mechanics = <T extends Partial<PC | MapToken | TokenBlueprint>>(value: T) => ({
          raceId: value.raceId ?? ruleId("race", value.race) ?? "",
          subraceId: value.subraceId ?? ruleId("subrace", value.subrace) ?? "",
          classId: value.classId ?? ruleId("class", value.className) ?? "",
          subclassId: value.subclassId ?? ruleId("subclass", value.subclass) ?? "",
          backgroundId: value.backgroundId ?? "",
          race: value.race === "Default" ? "" : value.race ?? "",
          subrace: value.subrace ?? "",
          className: value.className === "Default" ? "" : value.className ?? "",
          subclass: value.subclass ?? "",
          backgroundName: value.backgroundName ?? "",
          ruleChoices: Object.fromEntries(
            Object.entries(value.ruleChoices ?? {}).map(([key, choices]) => [
              key,
              [...choices],
            ])
          ),
          abilityImprovements: (value.abilityImprovements ?? []).map(
            (improvement) => ({
              level: Math.max(1, Math.min(20, Math.round(improvement.level))),
              increases: Object.fromEntries(
                Object.entries(improvement.increases ?? {}).map(([key, increase]) => [
                  key,
                  Math.max(0, Math.min(2, Math.round(increase ?? 0))),
                ])
              ),
            })
          ),
          creatureType: value.creatureType ?? "humanoid",
          size: value.size ?? "medium",
          level: value.level ?? 1,
          hp: value.hp ?? value.maxHp ?? 0,
          maxHp: value.maxHp ?? 0,
          // Nothing is easier to hit than an unarmored creature standing still,
          // and that is still armor class 10.
          ac: value.ac || 10,
          abilities: { ...DEFAULT_ABILITIES, ...value.abilities },
          skills: value.skills ?? [],
          traits: value.traits ?? [],
          features: value.features ?? [],
          statuses: (value.statuses ?? []).map((status) => {
            const preset = STATUS_EFFECT_PRESETS.find(
              (entry) =>
                entry.id === status.effectId ||
                entry.name.toLowerCase() === status.name.toLowerCase()
            );
            return {
              ...status,
              effectId: status.effectId ?? preset?.id,
              color: status.color ?? preset?.color,
            };
          }),
          inventory: (value.inventory ?? []).map((item) => ({
            ...item,
            equipped: item.equipped ?? false,
          })),
          wallet: value.wallet ?? { copper: 0, silver: 0, gold: 0 },
          statBlock: statBlockFor(value),
          portrait: value.portrait,
          deathSaves: normalizeDeathSaves(value.deathSaves),
        });
        const priorItems = state.customLibraryItems ?? [];
        const priorRules = state.ruleDefinitions ?? [];
        const deletedLibraryItemIds =
          state.deletedLibraryItemIds ??
          (version < 10
            ? LEGACY_PREMADE_ITEM_IDS.filter(
                (id) => !priorItems.some((item) => item.id === id)
              )
            : []);
        const deletedRuleDefinitionIds =
          state.deletedRuleDefinitionIds ??
          (version < 10
            ? LEGACY_PREMADE_RULE_IDS.filter(
                (id) => !priorRules.some((rule) => rule.id === id)
              )
            : []);
        const normalizeItem = (value: LibraryItem): LibraryItem => {
          const legacyCategory = value.category as string;
          const category: LibraryItem["category"] =
            legacyCategory === "trinket"
              ? "gear"
              : legacyCategory === "trash"
                ? "junk"
                : legacyCategory === "other"
                  ? "misc"
                  : value.category;
          const damageMatch = (value.damage ?? "").match(/^(\d+)d(\d+)$/);
          const legacySlot = value.equipSlot as string;
          return {
          ...value,
          category,
          rarity: normalizeItemRarity(value.rarity),
          equipSlot: legacySlot === "trinket" ? "gear" : value.equipSlot ?? "none",
          armorClass: value.armorClass ?? 0,
          armorBonus: value.armorBonus ?? 0,
          hpBonus: value.hpBonus ?? 0,
          costCp: value.costCp ?? Math.round((value.value ?? 0) * 100),
          sourcePage: value.sourcePage ?? 0,
          damage: value.damage ?? "",
          damageDiceCount:
            value.damageDiceCount ?? (damageMatch ? Number(damageMatch[1]) : 0),
          damageDie:
            value.damageDie ??
            ((damageMatch ? `d${damageMatch[2]}` : "d4") as LibraryItem["damageDie"]),
          damageType: value.damageType ?? "",
          weaponClass: value.weaponClass ?? "",
          weaponRange: value.weaponRange ?? "",
          properties: [...(value.properties ?? [])],
          armorDexterity:
            value.armorDexterity ??
            (value.equipSlot === "armor" && value.armorClass > 0 ? "full" : "none"),
          strengthRequirement: value.strengthRequirement ?? 0,
          stealthDisadvantage: value.stealthDisadvantage ?? false,
          containerType: value.containerType ?? "",
          contents: value.contents ?? "",
          capacity: value.capacity ?? "",
          actions: [...(value.actions ?? [])],
          contains: [...(value.contains ?? [])],
          image: value.image,
        };
        };
        const priorItemsById = new Map(priorItems.map((item) => [item.id, item]));
        const premadeItemIds = new Set(PREMADE_LIBRARY_ITEMS.map((item) => item.id));
        const customLibraryItems = [
          ...PREMADE_LIBRARY_ITEMS.filter(
            (item) => !deletedLibraryItemIds.includes(item.id)
          ).map((defaultItem) => {
            const prior = priorItemsById.get(defaultItem.id);
            if (!prior) return cloneLibraryItem(defaultItem);
            if (version < 19) return cloneLibraryItem(defaultItem);
            return normalizeItem({ ...defaultItem, ...prior });
          }),
          ...priorItems
            .filter((item) => !premadeItemIds.has(item.id))
            .map(normalizeItem),
        ];
        const normalizeRule = (value: RuleDefinition): RuleDefinition =>
          cloneRule({
            ...value,
            minLevel: Math.max(1, Math.min(20, value.minLevel ?? 1)),
            abilityScoreImprovementLevels: [
              ...new Set(
                (value.abilityScoreImprovementLevels ?? [])
                  .map((level) => Math.round(level))
                  .filter((level) => level >= 1 && level <= 20)
              ),
            ].sort((a, b) => a - b),
            resourceTracks: (value.resourceTracks ?? []).map((track) => ({
              ...track,
              values: (track.values ?? []).map((entry) => ({ ...entry })),
            })),
            spellcasting: value.spellcasting
              ? {
                  ...value.spellcasting,
                  slotsByLevel: (value.spellcasting.slotsByLevel ?? []).map(
                    (row) => [...row]
                  ),
                  slotLevels: value.spellcasting.slotLevels
                    ? [...value.spellcasting.slotLevels]
                    : undefined,
                  cantripsKnown: value.spellcasting.cantripsKnown
                    ? [...value.spellcasting.cantripsKnown]
                    : undefined,
                  spellsKnown: value.spellcasting.spellsKnown
                    ? [...value.spellcasting.spellsKnown]
                    : undefined,
                }
              : null,
            abilityBonuses: { ...(value.abilityBonuses ?? {}) },
            saveBonuses: { ...(value.saveBonuses ?? {}) },
            saveProficiencies: [...(value.saveProficiencies ?? [])],
            proficiencies: [...(value.proficiencies ?? [])],
            skillBonuses: (value.skillBonuses ?? []).map((skill) => ({ ...skill })),
            senses: [...(value.senses ?? [])],
            languages: [...(value.languages ?? [])],
            vulnerabilities: [...(value.vulnerabilities ?? [])],
            resistances: [...(value.resistances ?? [])],
            damageImmunities: [...(value.damageImmunities ?? [])],
            conditionImmunities: [...(value.conditionImmunities ?? [])],
            specialActions: [...(value.specialActions ?? [])],
            features: (value.features ?? []).map((feature) => ({
              ...feature,
              grants: feature.grants
                ? {
                    expertise: feature.grants.expertise
                      ? [...feature.grants.expertise]
                      : undefined,
                    halfProficiencyAbilities: feature.grants.halfProficiencyAbilities
                      ? [...feature.grants.halfProficiencyAbilities]
                      : undefined,
                  }
                : undefined,
            })),
            hitDie: value.hitDie ?? 0,
            sourcePage: value.sourcePage ?? 0,
            unarmoredAcAbilities: [...(value.unarmoredAcAbilities ?? [])],
            startingKit: (value.startingKit ?? []).map((entry) => ({ ...entry })),
            choices: (value.choices ?? []).map((choice) => ({
              ...choice,
              level: Math.max(1, Math.min(20, choice.level ?? 1)),
              levelCounts: (choice.levelCounts ?? []).map((entry) => ({
                level: Math.max(1, Math.min(20, entry.level)),
                count: Math.max(1, entry.count),
              })),
              options: [...(choice.options ?? [])],
            })),
          });
        const priorRulesById = new Map(priorRules.map((rule) => [rule.id, rule]));
        const premadeRuleIds = new Set(PREMADE_RULES.map((rule) => rule.id));
        const ruleDefinitions = [
          ...PREMADE_RULES.filter(
            (rule) => !deletedRuleDefinitionIds.includes(rule.id)
          ).map((defaultRule) => {
            const prior = priorRulesById.get(defaultRule.id);
            if (!prior) return cloneRule(defaultRule);
            if (version < 19) return cloneRule(defaultRule);
            if (version < 35) {
              const priorChoices = new Map(
                (prior.choices ?? []).map((choice) => [choice.id, choice])
              );
              const mergedChoices = defaultRule.choices.map((defaultChoice) => ({
                ...defaultChoice,
                ...(priorChoices.get(defaultChoice.id) ?? {}),
                level: defaultChoice.level,
                levelCounts: defaultChoice.levelCounts,
              }));
              const defaultChoiceIds = new Set(
                defaultRule.choices.map((choice) => choice.id)
              );
              return normalizeRule({
                ...defaultRule,
                ...prior,
                minLevel: defaultRule.minLevel,
                abilityScoreImprovementLevels:
                  defaultRule.abilityScoreImprovementLevels,
                resourceTracks: defaultRule.resourceTracks,
                spellcasting: defaultRule.spellcasting,
                features: defaultRule.features,
                choices: [
                  ...mergedChoices,
                  ...(prior.choices ?? []).filter(
                    (choice) => !defaultChoiceIds.has(choice.id)
                  ),
                ],
              });
            }
            return normalizeRule({ ...defaultRule, ...prior });
          }),
          ...priorRules
            .filter(
              (rule) =>
                !premadeRuleIds.has(rule.id) &&
                (rule as unknown as { kind: string }).kind !== "feat"
            )
            .map(normalizeRule),
        ];
        return {
          ...state,
          pcs: (state.pcs ?? []).map((pc) =>
            withPcLogistics(
              withCalculatedStats(
              {
                ...pc,
                ...mechanics(pc),
                inventory: assignEquipmentSlots(
                  mechanics(pc).inventory,
                  customLibraryItems
                ),
                alignment: pc.alignment || "True Neutral",
                goal: pc.goal ?? "",
                knowledge: pc.knowledge ?? "",
                width: pc.width ?? 1,
                height: pc.height ?? 1,
                bounds:
                  pc.bounds?.length > 0
                    ? pc.bounds
                    : rectangularTokenBounds(pc.width ?? 1, pc.height ?? 1),
              },
              ruleDefinitions,
              customLibraryItems
              )
            )
          ),
          tokens: (state.tokens ?? []).map((token) =>
            withTokenLogistics(
              withCalculatedStats(
              {
                ...token,
                ...mechanics(token),
                inventory: assignEquipmentSlots(
                  mechanics(token).inventory,
                  customLibraryItems
                ),
                givenName: token.givenName ?? "",
                width: token.width ?? 1,
                height: token.height ?? 1,
                bounds:
                  token.bounds?.length > 0
                    ? token.bounds
                    : rectangularTokenBounds(token.width ?? 1, token.height ?? 1),
              },
              ruleDefinitions,
              customLibraryItems
              )
            )
          ),
          customTokenBlueprints: (state.customTokenBlueprints ?? []).map((blueprint) =>
            withTokenLogistics(
              withCalculatedStats(
              {
                ...blueprint,
                ...mechanics(blueprint),
                inventory: assignEquipmentSlots(
                  mechanics(blueprint).inventory,
                  customLibraryItems
                ),
                bounds:
                  blueprint.bounds?.length > 0
                    ? blueprint.bounds
                    : rectangularTokenBounds(blueprint.width ?? 1, blueprint.height ?? 1),
              },
              ruleDefinitions,
              customLibraryItems
              )
            )
          ),
          customLibraryItems,
          ruleDefinitions,
          environments: (state.environments ?? []).map((environment) => ({
            ...environment,
            notes: environment.notes ?? "",
            lighting: normalizeLighting(environment.lighting),
            weather: normalizeWeather(environment.weather),
            background: environment.background ? { ...environment.background } : null,
            music: cloneEnvironmentTrack(environment.music),
            ambience: cloneEnvironmentTrack(environment.ambience),
            battleMusic: cloneEnvironmentTrack(environment.battleMusic),
            tokens: (environment.tokens ?? []).map((token) =>
              withTokenLogistics(
                withCalculatedStats(
                {
                  ...token,
                  ...mechanics(token),
                  givenName: token.givenName ?? "",
                  inventory: assignEquipmentSlots(
                    mechanics(token).inventory,
                    customLibraryItems
                  ),
                  bounds:
                    token.bounds?.length > 0
                      ? token.bounds
                      : rectangularTokenBounds(token.width ?? 1, token.height ?? 1),
                },
                ruleDefinitions,
                customLibraryItems
                )
              )
            ),
            saveAreas: (environment.saveAreas ?? []).map((area) =>
              normalizeSaveArea({
                ...area,
                id: area.id || crypto.randomUUID(),
              })
            ),
          })),
          saveAreas: (state.saveAreas ?? []).map((area) =>
            normalizeSaveArea({
              ...area,
              id: area.id || crypto.randomUUID(),
            })
          ),
          areaPresence: (state.areaPresence ?? []).filter(
            (entry) => entry.creatureId && entry.areaId
          ),
          lighting: normalizeLighting(state.lighting),
          weather: normalizeWeather(state.weather),
          music: cloneEnvironmentTrack(state.music),
          ambience: cloneEnvironmentTrack(state.ambience),
          battleMusic: cloneEnvironmentTrack(state.battleMusic),
          defaultBattleMusic: cloneEnvironmentTrack(state.defaultBattleMusic),
          combat: normalizeCombat(state.combat),
          activeEnvironmentId: state.activeEnvironmentId ?? null,
          mapCamera: state.mapCamera ?? null,
          activeView: state.activeView === "world-map" ? "world-map" : "grid",
          deletedLibraryItemIds,
          deletedRuleDefinitionIds,
          memory: {
            ...DEFAULT_SESSION_MEMORY,
            ...state.memory,
            bullets: (state.memory?.bullets ?? []).filter(Boolean),
          },
          settings: normalizeAISettings(state.settings),
          gameplaySettings: normalizeGameplaySettings(state.gameplaySettings),
          tokenIntents: (state.tokenIntents ?? [])
            .filter((intent) => intent.creatureId && intent.status === "pending")
            .map(normalizeTokenIntent),
          uiSettings: normalizeUISettings(omitLegacyDiceLook(state.uiSettings)),
        };
      },
      partialize: (s) => ({
        campaignName: s.campaignName,
        pcs: s.pcs,
        tokens: s.tokens,
        customTokenBlueprints: s.customTokenBlueprints,
        customLibraryItems: s.customLibraryItems,
        ruleDefinitions: s.ruleDefinitions,
        environments: s.environments,
        saveAreas: s.saveAreas,
        areaPresence: s.areaPresence,
        tokenIntents: s.tokenIntents,
        deletedLibraryItemIds: s.deletedLibraryItemIds,
        deletedRuleDefinitionIds: s.deletedRuleDefinitionIds,
        background: s.background,
        lighting: s.lighting,
        weather: s.weather,
        music: s.music,
        ambience: s.ambience,
        battleMusic: s.battleMusic,
        defaultBattleMusic: s.defaultBattleMusic,
        combat: s.combat,
        activeEnvironmentId: s.activeEnvironmentId,
        activeView: s.activeView,
        log: s.log,
        memory: s.memory,
        settings: s.settings,
        gameplaySettings: s.gameplaySettings,
        uiSettings: s.uiSettings,
      }),
    }
  )
);
