import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  AISettings,
  LogEntry,
  MapBackground,
  MapToken,
  PC,
  TokenKind,
} from "./types";
import { DEFAULT_ABILITIES, PC_COLORS } from "./types";

const uid = () => crypto.randomUUID();

const TOKEN_COLORS: Record<TokenKind, string> = {
  enemy: "#b0524f",
  npc: "#5f87a8",
  object: "#7d7a72",
};

interface RAMState {
  campaignName: string;
  pcs: PC[];
  tokens: MapToken[];
  background: MapBackground | null;
  log: LogEntry[];
  settings: AISettings;
  /** PC ids with an in-flight AI request. */
  thinking: string[];
  selectedPcId: string | null;
  settingsOpen: boolean;

  setCampaignName: (name: string) => void;
  addPC: () => string;
  updatePC: (id: string, patch: Partial<PC>) => void;
  deletePC: (id: string) => void;
  selectPC: (id: string | null) => void;

  addToken: (kind: TokenKind) => void;
  updateToken: (id: string, patch: Partial<MapToken>) => void;
  deleteToken: (id: string) => void;

  setBackground: (bg: MapBackground | null) => void;

  addLog: (entry: Omit<LogEntry, "id" | "ts">) => void;
  clearLog: () => void;

  setSettings: (patch: Partial<AISettings>) => void;
  setSettingsOpen: (open: boolean) => void;
  setThinking: (pcId: string, on: boolean) => void;
}

export const useRAM = create<RAMState>()(
  persist(
    (set, get) => ({
      campaignName: "New Campaign",
      pcs: [],
      tokens: [],
      background: null,
      log: [
        {
          id: uid(),
          ts: Date.now(),
          role: "system",
          author: "RAM",
          text: "Welcome, Game Master. Create a character, set the scene, and begin.",
        },
      ],
      settings: {
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4o-mini",
      },
      thinking: [],
      selectedPcId: null,
      settingsOpen: false,

      setCampaignName: (name) => set({ campaignName: name }),

      addPC: () => {
        const id = uid();
        const n = get().pcs.length;
        const pc: PC = {
          id,
          name: `Adventurer ${n + 1}`,
          race: "Human",
          className: "Fighter",
          level: 1,
          hp: 10,
          maxHp: 10,
          ac: 12,
          abilities: { ...DEFAULT_ABILITIES },
          skills: [],
          traits: [],
          features: [],
          inventory: [],
          statuses: [],
          personality:
            "Brave but cautious. Speaks plainly and acts decisively when the party hesitates.",
          color: PC_COLORS[n % PC_COLORS.length],
          x: n * 2,
          y: 0,
        };
        set({ pcs: [...get().pcs, pc], selectedPcId: id });
        return id;
      },

      updatePC: (id, patch) =>
        set({
          pcs: get().pcs.map((p) => (p.id === id ? { ...p, ...patch } : p)),
        }),

      deletePC: (id) =>
        set({
          pcs: get().pcs.filter((p) => p.id !== id),
          selectedPcId: get().selectedPcId === id ? null : get().selectedPcId,
        }),

      selectPC: (id) => set({ selectedPcId: id }),

      addToken: (kind) => {
        const count = get().tokens.filter((t) => t.kind === kind).length;
        const token: MapToken = {
          id: uid(),
          kind,
          name: `${kind === "npc" ? "NPC" : kind === "enemy" ? "Enemy" : "Object"} ${count + 1}`,
          color: TOKEN_COLORS[kind],
          notes: "",
          x: count * 2 + 1,
          y: kind === "enemy" ? -3 : kind === "npc" ? 3 : 5,
          ...(kind === "enemy" ? { hp: 10, maxHp: 10 } : {}),
        };
        set({ tokens: [...get().tokens, token] });
      },

      updateToken: (id, patch) =>
        set({
          tokens: get().tokens.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        }),

      deleteToken: (id) =>
        set({ tokens: get().tokens.filter((t) => t.id !== id) }),

      setBackground: (bg) => set({ background: bg }),

      addLog: (entry) =>
        set({
          log: [...get().log, { ...entry, id: uid(), ts: Date.now() }],
        }),

      clearLog: () => set({ log: [] }),

      setSettings: (patch) =>
        set({ settings: { ...get().settings, ...patch } }),

      setSettingsOpen: (open) => set({ settingsOpen: open }),

      setThinking: (pcId, on) =>
        set({
          thinking: on
            ? [...get().thinking, pcId]
            : get().thinking.filter((id) => id !== pcId),
        }),
    }),
    {
      name: "ram-campaign",
      partialize: (s) => ({
        campaignName: s.campaignName,
        pcs: s.pcs,
        tokens: s.tokens,
        background: s.background,
        log: s.log,
        settings: s.settings,
      }),
    }
  )
);
