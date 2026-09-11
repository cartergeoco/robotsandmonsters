import type {
  PersistStorage,
  StateStorage,
  StorageValue,
} from "zustand/middleware";
import {
  normalizeLighting,
  normalizeWeather,
  type EnvironmentLighting,
  type EnvironmentWeather,
  type MapCamera,
} from "./types";

const DB_NAME = "ram-persist";
const STORE_NAME = "kv";
const ASSET_STORE_NAME = "assets";
const DB_VERSION = 2;
const SCENE_VIEW_KEY = "ram-scene-view";
const ASSET_PREFIX = "ram-asset:";
const ACTIVE_CAMPAIGN_KEY = "ram-active-campaign";

let storageReady = false;
let dbPromise: Promise<IDBDatabase> | null = null;
const pendingCampaignWrites = new Map<string, StorageValue<unknown>>();
let campaignWriteTimer = 0;
let campaignIdleCallback = 0;
let campaignWriteDelay = 300_000;

export type CampaignStorageStatus = {
  state: "loading" | "saved" | "saving" | "error";
  lastSavedAt: number | null;
  message: string;
};

let storageStatus: CampaignStorageStatus = {
  state: "loading",
  lastSavedAt: null,
  message: "Loading campaign storage…",
};
const storageStatusListeners = new Set<() => void>();

function updateStorageStatus(patch: Partial<CampaignStorageStatus>) {
  storageStatus = { ...storageStatus, ...patch };
  storageStatusListeners.forEach((listener) => listener());
}

export function getCampaignStorageStatus(): CampaignStorageStatus {
  return storageStatus;
}

export function subscribeCampaignStorageStatus(listener: () => void): () => void {
  storageStatusListeners.add(listener);
  return () => storageStatusListeners.delete(listener);
}

export function setCampaignWriteDelay(ms: number) {
  campaignWriteDelay = Math.max(0, Math.min(3_600_000, Math.round(ms)));
}

export function activeCampaignId(): string {
  try {
    return localStorage.getItem(ACTIVE_CAMPAIGN_KEY) || "default";
  } catch {
    return "default";
  }
}

export function campaignStorageKey(id = activeCampaignId()): string {
  return id === "default" ? "ram-campaign" : `ram-campaign:${id}`;
}

export function setActiveCampaignId(id: string) {
  try {
    localStorage.setItem(ACTIVE_CAMPAIGN_KEY, id);
  } catch {
    // The active in-memory campaign still works without metadata persistence.
  }
}

export type SceneViewSnapshot = {
  lighting: EnvironmentLighting;
  weather: EnvironmentWeather;
  activeEnvironmentId: string | null;
  mapCamera: MapCamera | null;
  activeView: "grid" | "world-map";
};

export function markCampaignStorageReady() {
  storageReady = true;
  updateStorageStatus({ state: "saved", message: "Campaign loaded." });
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(`${label} timed out`));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(ASSET_STORE_NAME)) {
        db.createObjectStore(ASSET_STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Could not open campaign storage."));
    };
  });
  return dbPromise;
}

function idbStoreRequest<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const request = run(tx.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("Campaign storage request failed."));
      })
  );
}

function idbRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return idbStoreRequest(STORE_NAME, mode, run);
}

function assetId(dataUrl: string): string {
  let hash = 2166136261;
  const stride = Math.max(1, Math.floor(dataUrl.length / 8192));
  for (let index = 0; index < dataUrl.length; index += stride) {
    hash ^= dataUrl.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${(hash >>> 0).toString(36)}-${dataUrl.length.toString(36)}`;
}

function dataUrlToBlob(value: string): Blob {
  const comma = value.indexOf(",");
  const meta = value.slice(5, comma);
  const content = value.slice(comma + 1);
  const mime = meta.split(";")[0] || "application/octet-stream";
  if (meta.includes(";base64")) {
    const binary = atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(content)], { type: mime });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function externalizeAssets(value: unknown): Promise<unknown> {
  if (typeof value === "string" && value.startsWith("data:")) {
    const id = assetId(value);
    await idbStoreRequest(ASSET_STORE_NAME, "readwrite", (store) =>
      store.put(dataUrlToBlob(value), id)
    );
    return `${ASSET_PREFIX}${id}`;
  }
  if (Array.isArray(value)) return Promise.all(value.map(externalizeAssets));
  if (!value || typeof value !== "object") return value;
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, child]) => [key, await externalizeAssets(child)])
  );
  return Object.fromEntries(entries);
}

async function restoreAssets(value: unknown): Promise<unknown> {
  if (typeof value === "string" && value.startsWith(ASSET_PREFIX)) {
    const blob = await idbStoreRequest<Blob | undefined>(
      ASSET_STORE_NAME,
      "readonly",
      (store) => store.get(value.slice(ASSET_PREFIX.length))
    );
    return blob ? blobToDataUrl(blob) : "";
  }
  if (Array.isArray(value)) return Promise.all(value.map(restoreAssets));
  if (!value || typeof value !== "object") return value;
  const entries = await Promise.all(
    Object.entries(value).map(async ([key, child]) => [key, await restoreAssets(child)])
  );
  return Object.fromEntries(entries);
}

export function readSceneView(): SceneViewSnapshot | null {
  try {
    const raw = localStorage.getItem(SCENE_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SceneViewSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      lighting: normalizeLighting(parsed.lighting),
      weather: normalizeWeather(parsed.weather),
      activeEnvironmentId: parsed.activeEnvironmentId ?? null,
      mapCamera: parsed.mapCamera ?? null,
      activeView: parsed.activeView === "world-map" ? "world-map" : "grid",
    };
  } catch {
    return null;
  }
}

export function writeSceneView(snapshot: Partial<SceneViewSnapshot>) {
  try {
    const prev = readSceneView();
    const next: SceneViewSnapshot = {
      lighting: normalizeLighting(snapshot.lighting ?? prev?.lighting),
      weather: normalizeWeather(snapshot.weather ?? prev?.weather),
      activeEnvironmentId:
        snapshot.activeEnvironmentId !== undefined
          ? snapshot.activeEnvironmentId
          : (prev?.activeEnvironmentId ?? null),
      mapCamera:
        snapshot.mapCamera !== undefined ? snapshot.mapCamera : (prev?.mapCamera ?? null),
      activeView:
        snapshot.activeView ?? prev?.activeView ?? "grid",
    };
    localStorage.setItem(SCENE_VIEW_KEY, JSON.stringify(next));
  } catch {
    // Keep the live session even if the tiny view snapshot cannot be stored.
  }
}

export const campaignStateStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const fromIdb = await withTimeout(
        idbRequest<unknown>("readonly", (store) => store.get(name)),
        2000,
        "IndexedDB read"
      );
      if (typeof fromIdb === "string") return fromIdb;
    } catch {
      // Fall back to the previous localStorage campaign blob.
    }
    try {
      return localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: async (name, value) => {
    if (!storageReady) return;
    updateStorageStatus({ state: "saving", message: "Saving campaign…" });
    try {
      await withTimeout(
        idbRequest("readwrite", (store) => store.put(value, name)),
        4000,
        "IndexedDB write"
      );
      updateStorageStatus({
        state: "saved",
        lastSavedAt: Date.now(),
        message: "Campaign saved.",
      });
    } catch (error) {
      console.warn("Could not persist campaign to IndexedDB.", error);
      try {
        localStorage.setItem(name, value);
      } catch (fallbackError) {
        console.warn("Could not persist campaign to localStorage.", fallbackError);
        updateStorageStatus({
          state: "error",
          message: "Campaign could not be saved. Export a backup before closing.",
        });
      }
    }
  },
  removeItem: async (name) => {
    try {
      await idbRequest("readwrite", (store) => store.delete(name));
    } catch {
      // Ignore cleanup failures.
    }
    try {
      localStorage.removeItem(name);
    } catch {
      // Ignore cleanup failures.
    }
  },
};

function cancelScheduledCampaignWrite() {
  window.clearTimeout(campaignWriteTimer);
  campaignWriteTimer = 0;
  if (campaignIdleCallback && "cancelIdleCallback" in window) {
    window.cancelIdleCallback(campaignIdleCallback);
  }
  campaignIdleCallback = 0;
}

export function flushCampaignWrites(syncFallback = false) {
  cancelScheduledCampaignWrite();
  const writes = [...pendingCampaignWrites];
  pendingCampaignWrites.clear();
  for (const [name, value] of writes) {
    if (syncFallback) {
      try {
        localStorage.setItem(name, JSON.stringify(value));
      } catch {
        // IndexedDB remains the primary campaign store.
      }
    }
    updateStorageStatus({ state: "saving", message: "Saving campaign…" });
    void externalizeAssets(value)
      .then((stored) => idbRequest("readwrite", (store) => store.put(stored, name)))
      .then(() =>
        updateStorageStatus({
          state: "saved",
          lastSavedAt: Date.now(),
          message: "Campaign saved.",
        })
      )
      .catch((error) => {
        console.warn("Could not persist campaign to IndexedDB.", error);
        try {
          localStorage.setItem(name, JSON.stringify(value));
          updateStorageStatus({
            state: "saved",
            lastSavedAt: Date.now(),
            message: "Campaign saved using fallback storage.",
          });
        } catch (fallbackError) {
          console.warn("Could not persist campaign to localStorage.", fallbackError);
          updateStorageStatus({
            state: "error",
            message: "Campaign could not be saved. Export a backup before closing.",
          });
        }
      });
  }
}

export async function readCampaignValue<S>(
  name: string
): Promise<StorageValue<S> | null> {
  try {
    const stored = await idbRequest<unknown>("readonly", (store) => store.get(name));
    if (!stored) return null;
    if (typeof stored === "string") return JSON.parse(stored) as StorageValue<S>;
    return (await restoreAssets(stored)) as StorageValue<S>;
  } catch {
    const fallback = localStorage.getItem(name);
    return fallback ? (JSON.parse(fallback) as StorageValue<S>) : null;
  }
}

export async function writeCampaignValue<S>(
  name: string,
  value: StorageValue<S>
): Promise<void> {
  const stored = await externalizeAssets(value);
  await idbRequest("readwrite", (store) => store.put(stored, name));
}

export async function deleteCampaignValue(name: string): Promise<void> {
  await campaignStateStorage.removeItem(name);
}

export async function requestDurableCampaignStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function campaignStorageEstimate(): Promise<StorageEstimate | null> {
  try {
    return navigator.storage?.estimate ? await navigator.storage.estimate() : null;
  } catch {
    return null;
  }
}

function scheduleCampaignWrite() {
  if (campaignWriteDelay === 0) return;
  if (campaignWriteTimer || campaignIdleCallback) return;
  campaignWriteTimer = window.setTimeout(() => {
    campaignWriteTimer = 0;
    flushCampaignWrites();
  }, campaignWriteDelay);
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => flushCampaignWrites(true));
  window.addEventListener("blur", () => flushCampaignWrites());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushCampaignWrites(true);
  });
}

/**
 * Zustand's JSON storage serializes the full campaign synchronously on every
 * state change. Keep the latest object instead, then structured-clone it to
 * IndexedDB once while idle.
 */
export function createCampaignPersistStorage<S>(): PersistStorage<S> {
  return {
    getItem: async (name) => {
      try {
        const stored = await withTimeout(
          idbRequest<unknown>("readonly", (store) => store.get(name)),
          2000,
          "IndexedDB read"
        );
        if (typeof stored === "string") {
          return JSON.parse(stored) as StorageValue<S>;
        }
        if (stored && typeof stored === "object") {
          return (await restoreAssets(stored)) as StorageValue<S>;
        }
      } catch {
        // Fall through to the previous localStorage campaign blob.
      }
      try {
        const fallback = localStorage.getItem(name);
        return fallback ? (JSON.parse(fallback) as StorageValue<S>) : null;
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      if (!storageReady) return;
      pendingCampaignWrites.set(name, value as StorageValue<unknown>);
      scheduleCampaignWrite();
    },
    removeItem: (name) => {
      pendingCampaignWrites.delete(name);
      return campaignStateStorage.removeItem(name);
    },
  };
}
