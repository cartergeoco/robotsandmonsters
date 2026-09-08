import type { StateStorage } from "zustand/middleware";
import type { EnvironmentLighting, MapCamera } from "./types";

const DB_NAME = "ram-persist";
const STORE_NAME = "kv";
const DB_VERSION = 1;
const SCENE_VIEW_KEY = "ram-scene-view";

let storageReady = false;
let dbPromise: Promise<IDBDatabase> | null = null;

export type SceneViewSnapshot = {
  lighting: EnvironmentLighting;
  activeEnvironmentId: string | null;
  mapCamera: MapCamera | null;
  activeView: "grid" | "world-map";
};

export function markCampaignStorageReady() {
  storageReady = true;
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

function idbRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode);
        const request = run(tx.objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error("Campaign storage request failed."));
      })
  );
}

export function readSceneView(): SceneViewSnapshot | null {
  try {
    const raw = localStorage.getItem(SCENE_VIEW_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SceneViewSnapshot>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      lighting: parsed.lighting ?? "daylight",
      activeEnvironmentId: parsed.activeEnvironmentId ?? null,
      mapCamera: parsed.mapCamera ?? null,
      activeView: parsed.activeView === "world-map" ? "world-map" : "grid",
    };
  } catch {
    return null;
  }
}

export function writeSceneView(snapshot: SceneViewSnapshot) {
  try {
    localStorage.setItem(SCENE_VIEW_KEY, JSON.stringify(snapshot));
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
    try {
      await withTimeout(
        idbRequest("readwrite", (store) => store.put(value, name)),
        4000,
        "IndexedDB write"
      );
    } catch (error) {
      console.warn("Could not persist campaign to IndexedDB.", error);
    }
    try {
      localStorage.setItem(name, value);
    } catch (error) {
      console.warn("Could not persist campaign to localStorage.", error);
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
