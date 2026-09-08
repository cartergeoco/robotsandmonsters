import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  campaignStateStorage,
  markCampaignStorageReady,
  readSceneView,
  writeSceneView,
} from "./persistStorage";
import type {
  AISettings,
  CreatureMechanics,
  Environment,
  EnvironmentLighting,
  LibraryItem,
  LogEntry,
  MapBackground,
  MapCamera,
  MapToken,
  PC,
  RuleDefinition,
  TokenBlueprint,
  TokenKind,
  UISettings,
} from "./types";
import {
  DEFAULT_ABILITIES,
  DEFAULT_AI_SETTINGS,
  DEFAULT_UI_SETTINGS,
  PC_COLORS,
  STATUS_EFFECT_PRESETS,
  assignEquipmentSlots,
  calculateCreatureStats,
  DEFAULT_GRID_OPACITY,
  DEFAULT_GRID_SIZE,
  inventoryFromKit,
  normalizeGridOpacity,
  normalizeGridSize,
  rectangularTokenBounds,
  resolvedCreatureProfile,
} from "./types";
import { PREMADE_LIBRARY_ITEMS } from "./itemCatalog";
import { PREMADE_RULES } from "./ruleCatalog";
import { normalizeAISettings } from "./aiProviders";

const uid = () => crypto.randomUUID();
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
  inventory: token.inventory.map((item) => ({
    ...item,
    id: freshIds ? uid() : item.id,
  })),
  wallet: { ...token.wallet },
  bounds: token.bounds.map((cell) => ({ ...cell })),
});

const cloneMapToken = (token: MapToken): MapToken => copyMapToken(token, true);

const cloneEnvironment = (environment: Environment): Environment => ({
  ...environment,
  background: environment.background ? { ...environment.background } : null,
  tokens: environment.tokens.map(cloneMapToken),
});

const cloneRule = (rule: RuleDefinition): RuleDefinition => ({
  ...rule,
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
  features: rule.features.map((feature) => ({ ...feature })),
  unarmoredAcAbilities: [...rule.unarmoredAcAbilities],
  startingKit: (rule.startingKit ?? []).map((entry) => ({ ...entry })),
  choices: (rule.choices ?? []).map((choice) => ({
    ...choice,
    options: [...choice.options],
  })),
});

function withCalculatedStats<T extends CreatureMechanics>(
  value: T,
  rules: RuleDefinition[],
  items: LibraryItem[]
): T {
  if ("kind" in value && value.kind === "object") return value;
  const calculated = calculateCreatureStats(value, rules, items);
  const profile = resolvedCreatureProfile(value, rules);
  return {
    ...value,
    ...profile,
    maxHp: calculated.maxHp,
    ac: calculated.armorClass,
  };
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
  deletedLibraryItemIds: string[];
  deletedRuleDefinitionIds: string[];
  background: MapBackground | null;
  lighting: EnvironmentLighting;
  activeEnvironmentId: string | null;
  mapCamera: MapCamera | null;
  log: LogEntry[];
  settings: AISettings;
  uiSettings: UISettings;
  /** PC ids with an in-flight AI request. */
  thinking: string[];
  selectedPcId: string | null;
  settingsOpen: boolean;
  tokenManagerOpen: boolean;
  tokenManagerKind: TokenKind | "all";
  tokenManagerTab: "library" | "map";
  tokenManagerTokenId: string | null;
  activeView: "grid" | "world-map";

  setCampaignName: (name: string) => void;
  addPC: () => string;
  duplicatePC: (id: string) => void;
  levelUpParty: () => void;
  updatePC: (id: string, patch: Partial<PC>) => void;
  deletePC: (id: string) => void;
  selectPC: (id: string | null) => void;

  placeToken: (blueprint: TokenBlueprint) => void;
  updateToken: (id: string, patch: Partial<MapToken>) => void;
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
  setLighting: (lighting: EnvironmentLighting) => void;
  setMapCamera: (camera: MapCamera) => void;
  setTokenManagerOpen: (
    open: boolean,
    kind?: TokenKind | "all",
    tab?: "library" | "map",
    tokenId?: string | null
  ) => void;

  setBackground: (bg: MapBackground | null) => void;

  addLog: (entry: Omit<LogEntry, "id" | "ts">) => void;
  clearLog: () => void;

  setSettings: (patch: Partial<AISettings>) => void;
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
  | "deletedLibraryItemIds"
  | "deletedRuleDefinitionIds"
  | "background"
  | "lighting"
  | "activeEnvironmentId"
  | "mapCamera"
  | "activeView"
  | "log"
  | "settings"
  | "uiSettings"
>;

type LegacyPersistedRAMState = Omit<
  PersistedRAMState,
  | "settings"
  | "uiSettings"
  | "customTokenBlueprints"
  | "customLibraryItems"
  | "ruleDefinitions"
  | "environments"
  | "deletedLibraryItemIds"
  | "deletedRuleDefinitionIds"
  | "lighting"
  | "activeEnvironmentId"
  | "mapCamera"
  | "activeView"
> & {
  settings: Partial<AISettings>;
  uiSettings?: Partial<UISettings>;
  customTokenBlueprints?: TokenBlueprint[];
  customLibraryItems?: LibraryItem[];
  ruleDefinitions?: RuleDefinition[];
  environments?: Environment[];
  deletedLibraryItemIds?: string[];
  deletedRuleDefinitionIds?: string[];
  lighting?: EnvironmentLighting;
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
          activeEnvironmentId: state.activeEnvironmentId,
          mapCamera: state.mapCamera,
          activeView: state.activeView,
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
      deletedLibraryItemIds: [],
      deletedRuleDefinitionIds: [],
      background: null,
      lighting: "daylight",
      activeEnvironmentId: null,
      mapCamera: null,
      log: [
        {
          id: uid(),
          ts: Date.now(),
          role: "system",
          author: "System",
          text: "Welcome, Game Master. Create a character, set the scene, and begin.",
        },
      ],
      settings: { ...DEFAULT_AI_SETTINGS },
      uiSettings: { ...DEFAULT_UI_SETTINGS },
      thinking: [],
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
            alignment: "True Neutral",
            personality:
              "Brave but cautious. Speaks plainly and acts decisively when the party hesitates.",
            color: PC_COLORS[n % PC_COLORS.length],
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
          skills: source.skills.map((skill) => ({ ...skill, id: uid() })),
          traits: source.traits.map((trait) => ({ ...trait, id: uid() })),
          features: source.features.map((feature) => ({ ...feature, id: uid() })),
          statuses: source.statuses.map((status) => ({ ...status, id: uid() })),
          inventory: source.inventory.map((item) => ({ ...item, id: uid() })),
          wallet: { ...source.wallet },
          bounds: source.bounds.map((cell) => ({ ...cell })),
        };
        set({ pcs: [...get().pcs, copy], selectedPcId: copy.id });
      },

      levelUpParty: () =>
        set({
          pcs: get().pcs.map((pc) => {
            const next = withCalculatedStats(
              { ...pc, level: pc.level + 1 },
              get().ruleDefinitions,
              get().customLibraryItems
            );
            const gainedHp = Math.max(0, next.maxHp - pc.maxHp);
            return { ...next, hp: Math.min(next.maxHp, pc.hp + gainedHp) };
          }),
        }),

      updatePC: (id, patch) =>
        set({
          pcs: get().pcs.map((p) =>
            p.id === id
              ? withCalculatedStats(
                  { ...p, ...patch },
                  get().ruleDefinitions,
                  get().customLibraryItems
                )
              : p
          ),
        }),

      deletePC: (id) =>
        set({
          pcs: get().pcs.filter((p) => p.id !== id),
          selectedPcId: get().selectedPcId === id ? null : get().selectedPcId,
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
          hp: blueprint.maxHp,
          skills: blueprint.skills.map((skill) => ({ ...skill, id: uid() })),
          traits: blueprint.traits.map((trait) => ({ ...trait, id: uid() })),
          features: blueprint.features.map((feature) => ({ ...feature, id: uid() })),
          statuses: blueprint.statuses.map((status) => ({ ...status, id: uid() })),
          ruleChoices: Object.fromEntries(
            Object.entries(blueprint.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
          ),
          inventory: blueprint.inventory.map((item) => ({ ...item, id: uid() })),
          wallet: { ...blueprint.wallet },
          bounds:
            blueprint.bounds?.length > 0
              ? blueprint.bounds.map((cell) => ({ ...cell }))
              : rectangularTokenBounds(blueprint.width, blueprint.height),
          x: count * 2 + 1,
          y: kind === "enemy" ? -3 : 2,
        };
        void _source;
        set({ tokens: [...get().tokens, token] });
      },

      updateToken: (id, patch) =>
        set({
          tokens: get().tokens.map((t) =>
            t.id === id
              ? withCalculatedStats(
                  { ...t, ...patch },
                  get().ruleDefinitions,
                  get().customLibraryItems
                )
              : t
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
          inventory: source.inventory.map((item) => ({ ...item, id: uid() })),
          wallet: { ...source.wallet },
        };
        set({ tokens: [...get().tokens, copy] });
      },

      deleteToken: (id) =>
        set({ tokens: get().tokens.filter((t) => t.id !== id) }),

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
        set({
          activeEnvironmentId: id,
          lighting: environment.lighting,
          background: environment.background ? { ...environment.background } : null,
          tokens: environment.tokens.map(cloneMapToken),
        });
        snapshotScene();
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
                  background: get().background ? { ...get().background! } : null,
                  tokens: get().tokens.map(cloneMapToken),
                }
              : entry
          ),
          activeEnvironmentId: id,
        });
        snapshotScene();
      },

      setLighting: (lighting) => {
        set({ lighting });
        snapshotScene();
      },

      setMapCamera: (mapCamera) => {
        set({ mapCamera });
        snapshotScene();
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
          log: [...get().log, { ...entry, id: uid(), ts: Date.now() }],
        }),

      clearLog: () => set({ log: [] }),

      setSettings: (patch) =>
        set({ settings: normalizeAISettings({ ...get().settings, ...patch }) }),

      setUISettings: (patch) => {
        const next = { ...get().uiSettings, ...patch };
        set({
          uiSettings: {
            ...next,
            gridSize: normalizeGridSize(next.gridSize),
            gridOpacity: normalizeGridOpacity(next.gridOpacity),
          },
        });
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
      name: "ram-campaign",
      storage: createJSONStorage(() => campaignStateStorage),
      version: 25,
      onRehydrateStorage: () => (state, error) => {
        markCampaignStorageReady();
        if (error || !state) return;
        const scene = readSceneView();
        if (!scene) return;
        useRAM.setState({
          lighting: scene.lighting ?? state.lighting,
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
          lighting: scene?.lighting ?? persisted.lighting ?? currentState.lighting,
          activeEnvironmentId:
            scene && "activeEnvironmentId" in scene
              ? scene.activeEnvironmentId
              : (persisted.activeEnvironmentId ?? currentState.activeEnvironmentId),
          mapCamera: scene?.mapCamera ?? persisted.mapCamera ?? currentState.mapCamera,
          activeView: scene?.activeView ?? persisted.activeView ?? currentState.activeView,
          background: persisted.background !== undefined ? persisted.background : currentState.background,
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
          creatureType: value.creatureType ?? "humanoid",
          size: value.size ?? "medium",
          level: value.level ?? 1,
          hp: value.hp ?? value.maxHp ?? 0,
          maxHp: value.maxHp ?? 0,
          ac: value.ac ?? 10,
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
          portrait: value.portrait,
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
            features: (value.features ?? []).map((feature) => ({ ...feature })),
            hitDie: value.hitDie ?? 0,
            sourcePage: value.sourcePage ?? 0,
            unarmoredAcAbilities: [...(value.unarmoredAcAbilities ?? [])],
            startingKit: (value.startingKit ?? []).map((entry) => ({ ...entry })),
            choices: (value.choices ?? []).map((choice) => ({
              ...choice,
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
            withCalculatedStats(
              {
                ...pc,
                ...mechanics(pc),
                inventory: assignEquipmentSlots(
                  mechanics(pc).inventory,
                  customLibraryItems
                ),
                alignment: pc.alignment || "True Neutral",
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
          ),
          tokens: (state.tokens ?? []).map((token) =>
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
          ),
          customTokenBlueprints: (state.customTokenBlueprints ?? []).map((blueprint) =>
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
          ),
          customLibraryItems,
          ruleDefinitions,
          environments: (state.environments ?? []).map((environment) => ({
            ...environment,
            notes: environment.notes ?? "",
            lighting: environment.lighting ?? "daylight",
            background: environment.background ? { ...environment.background } : null,
            tokens: (environment.tokens ?? []).map((token) =>
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
            ),
          })),
          lighting: state.lighting ?? "daylight",
          activeEnvironmentId: state.activeEnvironmentId ?? null,
          mapCamera: state.mapCamera ?? null,
          activeView: state.activeView === "world-map" ? "world-map" : "grid",
          deletedLibraryItemIds,
          deletedRuleDefinitionIds,
          settings: normalizeAISettings(state.settings),
          uiSettings: {
            ...DEFAULT_UI_SETTINGS,
            ...state.uiSettings,
            gridSize: normalizeGridSize(
              state.uiSettings?.gridSize ?? DEFAULT_GRID_SIZE
            ),
            gridOpacity: normalizeGridOpacity(
              state.uiSettings?.gridOpacity ?? DEFAULT_GRID_OPACITY
            ),
          },
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
        deletedLibraryItemIds: s.deletedLibraryItemIds,
        deletedRuleDefinitionIds: s.deletedRuleDefinitionIds,
        background: s.background,
        lighting: s.lighting,
        activeEnvironmentId: s.activeEnvironmentId,
        mapCamera: s.mapCamera,
        activeView: s.activeView,
        log: s.log,
        settings: s.settings,
        uiSettings: s.uiSettings,
      }),
    }
  )
);
