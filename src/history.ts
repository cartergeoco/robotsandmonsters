import { useRAM } from "./store";

type Snapshot = Record<string, unknown>;

const MAX_HISTORY = 30;
const listeners = new Set<() => void>();
let past: Snapshot[] = [];
let future: Snapshot[] = [];
let current: Snapshot | null = null;
let timer = 0;
let applying = false;
let initialized = false;

function snapshot(): Snapshot {
  const state = useRAM.getState();
  const partialize = useRAM.persist.getOptions().partialize;
  const value = (partialize ? partialize(state) : state) as unknown as Snapshot;
  return structuredClone(value);
}

function notify() {
  listeners.forEach((listener) => listener());
}

function commit() {
  timer = 0;
  if (applying) return;
  const next = snapshot();
  if (current && JSON.stringify(next) === JSON.stringify(current)) return;
  if (current) {
    past = [...past.slice(-(MAX_HISTORY - 1)), current];
  }
  current = next;
  future = [];
  notify();
}

export function initializeCampaignHistory(): () => void {
  if (initialized) return () => {};
  initialized = true;
  current = snapshot();
  const unsubscribe = useRAM.subscribe(() => {
    if (applying) return;
    window.clearTimeout(timer);
    timer = window.setTimeout(commit, 450);
  });
  return () => {
    unsubscribe();
    window.clearTimeout(timer);
    initialized = false;
  };
}

export function resetCampaignHistory() {
  window.clearTimeout(timer);
  timer = 0;
  past = [];
  future = [];
  current = snapshot();
  notify();
}

export function undoCampaignChange() {
  if (!past.length || !current) return;
  window.clearTimeout(timer);
  const previous = past[past.length - 1];
  past = past.slice(0, -1);
  future = [current, ...future].slice(0, MAX_HISTORY);
  applying = true;
  useRAM.setState(previous);
  current = snapshot();
  applying = false;
  notify();
}

export function redoCampaignChange() {
  if (!future.length || !current) return;
  window.clearTimeout(timer);
  const next = future[0];
  future = future.slice(1);
  past = [...past.slice(-(MAX_HISTORY - 1)), current];
  applying = true;
  useRAM.setState(next);
  current = snapshot();
  applying = false;
  notify();
}

export function getHistoryStatus() {
  return { canUndo: past.length > 0, canRedo: future.length > 0 };
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
