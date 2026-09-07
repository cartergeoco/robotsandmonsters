export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export interface Item {
  id: string;
  name: string;
  qty: number;
  notes: string;
}

export interface Skill {
  id: string;
  name: string;
  bonus: number;
}

export interface Trait {
  id: string;
  name: string;
  description: string;
}

export interface StatusEffect {
  id: string;
  name: string;
  kind: "buff" | "debuff";
  note: string;
}

export interface PC {
  id: string;
  name: string;
  race: string;
  className: string;
  level: number;
  hp: number;
  maxHp: number;
  ac: number;
  abilities: AbilityScores;
  skills: Skill[];
  traits: Trait[];
  features: Trait[];
  inventory: Item[];
  statuses: StatusEffect[];
  personality: string;
  color: string;
  /** Optional token art (data URL), e.g. a 2-Minute Tabletop token. */
  image?: string;
  x: number;
  y: number;
}

export type TokenKind = "enemy" | "npc" | "object";

export interface MapToken {
  id: string;
  kind: TokenKind;
  name: string;
  color: string;
  image?: string;
  hp?: number;
  maxHp?: number;
  notes: string;
  x: number;
  y: number;
}

export interface LogEntry {
  id: string;
  ts: number;
  role: "gm" | "pc" | "system";
  author: string;
  authorId?: string;
  color?: string;
  text: string;
}

export interface MapBackground {
  /** Data URL of the map image (e.g. from 2-Minute Tabletop). */
  src: string;
  /** World-units-per-image-pixel scale multiplier. */
  scale: number;
}

export interface AISettings {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export const DEFAULT_ABILITIES: AbilityScores = {
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
};

export const PC_COLORS = [
  "#c9a86a",
  "#8fb996",
  "#9a8fc2",
  "#c98a8a",
  "#7fa8c9",
  "#c9b97f",
  "#a8c97f",
  "#c97fa8",
];

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(mod: number): string {
  return mod >= 0 ? `+${mod}` : String(mod);
}
