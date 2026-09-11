import { HANDBOOK_MONSTERS } from "./handbookMonsterCatalog";
import {
  DEFAULT_ABILITIES,
  createStatBlock,
  defaultStanceForKind,
  rectangularTokenBounds,
  type TokenBlueprint,
  type TokenKind,
} from "./types";

export const BUILT_IN_TOKEN_BLUEPRINTS: TokenBlueprint[] = HANDBOOK_MONSTERS;

export function createBlankTokenBlueprint(kind: TokenKind): TokenBlueprint {
  return {
    id: crypto.randomUUID(),
    source: "custom",
    kind,
    name: kind === "enemy" ? "New Enemy" : kind === "npc" ? "New NPC" : "New Object",
    color: kind === "enemy" ? "#765462" : kind === "npc" ? "#68758a" : "#78808f",
    raceId: "",
    subraceId: "",
    classId: "",
    subclassId: "",
    backgroundId: "",
    race: "",
    subrace: "",
    className: "",
    subclass: "",
    backgroundName: "",
    ruleChoices: {},
    abilityImprovements: [],
    creatureType: kind === "object" ? "object" : "humanoid",
    size: "medium",
    level: 1,
    // Zero hit points leaves a new object as scenery that cannot be attacked
    // until the Dungeon Master gives it a hit point total.
    hp: kind === "object" ? 0 : 10,
    maxHp: kind === "object" ? 0 : 10,
    ac: 10,
    abilities: { ...DEFAULT_ABILITIES },
    skills: [],
    traits: [],
    features: [],
    inventory: [],
    wallet: { copper: 0, silver: 0, gold: 0 },
    statuses: [],
    deathSaves: { successes: 0, failures: 0, stable: false, dead: false },
    // Map tokens are stat block creatures by default, so they need no race or class.
    statBlock: createStatBlock({
      alignment: kind === "object" ? "Unaligned" : "True Neutral",
      speeds: kind === "object" ? { walk: 0 } : undefined,
    }),
    notes: "",
    stance: defaultStanceForKind(kind),
    visualScale: 1,
    width: 1,
    height: 1,
    bounds: rectangularTokenBounds(1, 1),
  };
}
