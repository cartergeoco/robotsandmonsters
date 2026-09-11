import { PREMADE_LIBRARY_ITEMS } from "./itemCatalog";
import {
  campaignStorageKey,
  deleteCampaignValue,
  readCampaignValue,
  setActiveCampaignId,
  writeCampaignValue,
} from "./persistStorage";
import { PREMADE_RULES } from "./ruleCatalog";
import { useRAM } from "./store";
import {
  DEFAULT_SESSION_MEMORY,
  normalizeLighting,
  normalizeWeather,
  type LogEntry,
} from "./types";

export interface CampaignSlot {
  id: string;
  name: string;
  updatedAt: number;
}

interface CampaignBackup {
  format: "ram-campaign";
  formatVersion: 1;
  exportedAt: string;
  state: Record<string, unknown>;
  storeVersion: number;
}

const SLOT_LIST_KEY = "ram-campaign-slots";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function subscribeCampaignSlots(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function listCampaignSlots(): CampaignSlot[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SLOT_LIST_KEY) || "[]") as CampaignSlot[];
    if (Array.isArray(parsed) && parsed.length) return parsed;
  } catch {
    // Rebuild the default metadata below.
  }
  return [{ id: "default", name: useRAM.getState().campaignName, updatedAt: Date.now() }];
}

function writeSlots(slots: CampaignSlot[]) {
  localStorage.setItem(SLOT_LIST_KEY, JSON.stringify(slots));
  notify();
}

export function currentCampaignId(): string {
  const options = useRAM.persist.getOptions();
  const name = String(options.name);
  return name === "ram-campaign" ? "default" : name.replace(/^ram-campaign:/, "");
}

function persistedState(): Record<string, unknown> {
  const state = useRAM.getState();
  const partialize = useRAM.persist.getOptions().partialize;
  return (partialize ? partialize(state) : state) as unknown as Record<string, unknown>;
}

function storageValue(state = persistedState()) {
  return {
    state,
    version: Number(useRAM.persist.getOptions().version ?? 0),
  };
}

async function saveSlot(id: string, name: string) {
  await writeCampaignValue(campaignStorageKey(id), storageValue());
  const now = Date.now();
  const slots = listCampaignSlots();
  const next = slots.some((slot) => slot.id === id)
    ? slots.map((slot) => (slot.id === id ? { ...slot, name, updatedAt: now } : slot))
    : [...slots, { id, name, updatedAt: now }];
  writeSlots(next);
}

export async function saveCurrentCampaign(): Promise<void> {
  await saveSlot(currentCampaignId(), useRAM.getState().campaignName);
}

export async function switchCampaign(id: string): Promise<void> {
  if (id === currentCampaignId()) return;
  await saveCurrentCampaign();
  const value = await readCampaignValue<Record<string, unknown>>(campaignStorageKey(id));
  if (!value) throw new Error("That campaign could not be loaded.");
  setActiveCampaignId(id);
  useRAM.persist.setOptions({ name: campaignStorageKey(id) });
  await useRAM.persist.rehydrate();
  useRAM.setState({
    selectedPcId: null,
    selectedSaveAreaId: null,
    settingsOpen: false,
    tokenManagerOpen: false,
    thinking: [],
    memoryBusy: false,
  });
  notify();
}

function blankState(name: string): Record<string, unknown> {
  const now = Date.now();
  const welcome: LogEntry = {
    id: crypto.randomUUID(),
    ts: now,
    role: "system",
    author: "System",
    text: "Welcome, Game Master. Create a character, set the scene, and begin.",
  };
  const current = persistedState();
  return {
    ...current,
    campaignName: name,
    pcs: [],
    tokens: [],
    customTokenBlueprints: [],
    customLibraryItems: structuredClone(PREMADE_LIBRARY_ITEMS),
    ruleDefinitions: structuredClone(PREMADE_RULES),
    environments: [],
    saveAreas: [],
    areaPresence: [],
    tokenIntents: [],
    deletedLibraryItemIds: [],
    deletedRuleDefinitionIds: [],
    background: null,
    lighting: normalizeLighting("noon"),
    weather: normalizeWeather("clear"),
    music: null,
    ambience: null,
    battleMusic: null,
    defaultBattleMusic: null,
    combat: null,
    activeEnvironmentId: null,
    activeView: "grid",
    log: [welcome],
    memory: { ...DEFAULT_SESSION_MEMORY, bullets: [] },
  };
}

export async function createCampaign(name = "New Campaign"): Promise<string> {
  await saveCurrentCampaign();
  const id = crypto.randomUUID();
  await writeCampaignValue(campaignStorageKey(id), storageValue(blankState(name)));
  const slots = [...listCampaignSlots(), { id, name, updatedAt: Date.now() }];
  writeSlots(slots);
  await switchCampaign(id);
  return id;
}

export async function deleteCampaign(id: string): Promise<void> {
  if (id === currentCampaignId()) throw new Error("Switch campaigns before deleting this one.");
  await deleteCampaignValue(campaignStorageKey(id));
  writeSlots(listCampaignSlots().filter((slot) => slot.id !== id));
}

export function downloadCampaignBackup() {
  const state = persistedState();
  const settings = state.settings as Record<string, unknown> | undefined;
  const backup: CampaignBackup = {
    format: "ram-campaign",
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    storeVersion: Number(useRAM.persist.getOptions().version ?? 0),
    state: {
      ...state,
      settings: settings ? { ...settings, apiKey: "", savedKeys: {} } : settings,
    },
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${useRAM.getState().campaignName.replace(/[^\w-]+/g, "-") || "campaign"}.ram.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importCampaignBackup(file: File): Promise<void> {
  const parsed = JSON.parse(await file.text()) as Partial<CampaignBackup>;
  if (parsed.format !== "ram-campaign" || !parsed.state || typeof parsed.state !== "object") {
    throw new Error("This is not a valid RAM campaign backup.");
  }
  const liveSettings = useRAM.getState().settings;
  const importedSettings = (parsed.state.settings ?? {}) as Record<string, unknown>;
  const state = {
    ...parsed.state,
    settings: {
      ...importedSettings,
      apiKey: liveSettings.apiKey,
      savedKeys: liveSettings.savedKeys,
    },
  };
  const key = campaignStorageKey(currentCampaignId());
  await writeCampaignValue(key, { state, version: parsed.storeVersion ?? 0 });
  await useRAM.persist.rehydrate();
  await saveCurrentCampaign();
}
