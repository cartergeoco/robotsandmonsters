import { checkOptionsFor } from "./checks";
import {
  bearing,
  characterSheetSections,
  createEntityHandles,
  distanceFeet,
  handleForEntity,
  healthWord,
  observedPresence,
  type CharacterSheetSection,
  type EntityHandles,
  type PCContextInput,
} from "./aiContext";
import { observerCanPerceive, occupiedWorldCells } from "./perception";
import {
  calculateCreatureStats,
  assignEquipmentSlots,
  formatMod,
  tokenDisplayName,
  type GameplaySettings,
  type MapToken,
  type PC,
  type TokenCell,
  type TokenIntent,
  type ToolAutonomy,
} from "./types";

export type JSONSchema = Record<string, unknown>;
export type PCToolTier = "always" | "situational";
export type PCToolClass = "query" | "movement" | "actions" | "rolls" | "bookkeeping";

export interface PCToolDefinition {
  name: string;
  description: string;
  parameters: JSONSchema;
  tier: PCToolTier;
  autonomy: PCToolClass;
  run: (args: Record<string, unknown>, context: PCToolRuntime) => string | Promise<string>;
}

export interface PCToolRuntime {
  input: PCContextInput;
  handles: EntityHandles;
  gameplay: GameplaySettings;
  emitIntent: (intent: Omit<TokenIntent, "id" | "createdAt" | "status">) => void;
  say: (text: string) => void;
  emote: (text: string) => void;
  updatePC: (patch: Partial<PC>) => void;
  getLiveState: () => { pc: PC; party: PC[]; tokens: MapToken[] };
  movePC: (cell: TokenCell) => void;
  rollCheck: (checkId: string, reason: string) => Promise<string>;
  /** Advances initiative if it is this PC's turn. Returns whether it did. */
  endTurn?: () => boolean;
  movementDeclared: boolean;
  movementSpent: number;
}

const objectSchema = (
  properties: Record<string, JSONSchema>,
  required: string[] = []
): JSONSchema => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

const stringArg = (description: string, values?: readonly string[]): JSONSchema => ({
  type: "string",
  description,
  ...(values ? { enum: values } : {}),
});

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function finite(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function targetCell(args: Record<string, unknown>): TokenCell | null {
  const x = finite(args.x);
  const y = finite(args.y);
  return x === null || y === null ? null : { x: Math.round(x), y: Math.round(y) };
}

type VisibleEntity = { value: PC | MapToken; isPC: boolean };

function resolveVisible(handle: string, runtime: PCToolRuntime): VisibleEntity | null {
  const id = runtime.handles.byHandle[handle];
  if (!id) return null;
  const member = runtime.input.party.find((entry) => entry.id === id);
  if (member) {
    if (member.id === runtime.input.pc.id) return { value: member, isPC: true };
    if (
      distanceFeet(runtime.input.pc, member) >
      runtime.input.settings.perceptionRadius
    ) {
      return null;
    }
    return observerCanPerceive(
      runtime.input.pc,
      member,
      runtime.input.rules,
      runtime.input.libraryItems,
      runtime.input.settings.perceptionRadius
    )
      ? { value: member, isPC: true }
      : null;
  }
  const token = runtime.input.tokens.find((entry) => entry.id === id);
  if (!token) return null;
  if (
    distanceFeet(runtime.input.pc, token) >
    runtime.input.settings.perceptionRadius
  ) {
    return null;
  }
  return observerCanPerceive(
    runtime.input.pc,
    token,
    runtime.input.rules,
    runtime.input.libraryItems,
    runtime.input.settings.perceptionRadius
  )
    ? { value: token, isPC: false }
    : null;
}

function entityName(entity: VisibleEntity): string {
  return entity.isPC
    ? (entity.value as PC).name
    : tokenDisplayName(entity.value as MapToken);
}

function entityLine(entity: VisibleEntity, runtime: PCToolRuntime): string {
  const value = entity.value;
  const stats = calculateCreatureStats(
    value,
    runtime.input.rules,
    runtime.input.libraryItems
  );
  const kind = entity.isPC ? "companion" : observedPresence(value as MapToken);
  return [
    `[${handleForEntity(runtime.handles, "id" in value ? value.id : "")}]`,
    entityName(entity),
    kind,
    `${distanceFeet(runtime.input.pc, value)}ft ${bearing(runtime.input.pc, value)}`,
    healthWord(value.hp, stats.maxHp, value.deathSaves),
  ].join("|");
}

function intentMode(runtime: PCToolRuntime, kind: PCToolClass): ToolAutonomy {
  if (kind === "movement") return runtime.gameplay.movement;
  if (kind === "rolls") return runtime.gameplay.rolls;
  if (kind === "bookkeeping") return runtime.gameplay.bookkeeping;
  return runtime.gameplay.actions;
}

function emit(
  runtime: PCToolRuntime,
  autonomyClass: PCToolClass,
  kind: TokenIntent["kind"],
  title: string,
  detail: string,
  extra: Partial<Pick<TokenIntent, "targetCell" | "checkId" | "payload">> = {}
) {
  const configured = intentMode(runtime, autonomyClass);
  runtime.emitIntent({
    creatureId: runtime.input.pc.id,
    kind,
    title,
    detail,
    autonomy: configured === "propose" ? "propose" : "announce",
    ...extra,
  });
}

function applyPCPatch(runtime: PCToolRuntime, patch: Partial<PC>) {
  runtime.updatePC(patch);
  Object.assign(runtime.input.pc, patch);
}

const SHEET_SECTIONS: CharacterSheetSection[] = [
  "summary",
  "vitals",
  "abilities",
  "skills",
  "defenses",
  "personality",
  "inventory",
  "features",
  "actions",
];

export const PC_TOOLS: PCToolDefinition[] = [
  {
    name: "get_my_sheet",
    description: "Read one section of your own character sheet.",
    parameters: objectSchema(
      { section: stringArg("Sheet section to read.", [...SHEET_SECTIONS, "all"]) },
      ["section"]
    ),
    tier: "always",
    autonomy: "query",
    run: (args, runtime) => {
      const sections = characterSheetSections(
        runtime.input.pc,
        runtime.input.rules,
        runtime.input.libraryItems
      );
      const section = text(args.section);
      return section === "all"
        ? Object.values(sections).filter(Boolean).join("\n")
        : sections[section as CharacterSheetSection] || `ERROR|unknown sheet section ${section}`;
    },
  },
  {
    name: "get_inventory",
    description: "List your carried gear, optionally filtered by a word.",
    parameters: objectSchema({ filter: stringArg("Optional item name or gear property.") }),
    tier: "always",
    autonomy: "query",
    run: (args, runtime) => {
      const filter = text(args.filter).toLowerCase();
      const items = runtime.input.pc.inventory.filter((item) =>
        filter ? `${item.name} ${item.notes}`.toLowerCase().includes(filter) : true
      );
      return items.length
        ? [
            "INVENTORY|* equipped;- carried",
            ...items.map(
              (item) =>
                `${item.equipped ? "*" : "-"}[${item.id}] ${item.name}x${item.qty}${item.notes ? `|${item.notes}` : ""}`
            ),
          ].join("\n")
        : "INVENTORY|no matching items";
    },
  },
  {
    name: "get_action_options",
    description: "List attacks, special actions, bonus actions, and reactions available to you.",
    parameters: objectSchema({}),
    tier: "always",
    autonomy: "query",
    run: (_args, runtime) => {
      const stats = calculateCreatureStats(
        runtime.input.pc,
        runtime.input.rules,
        runtime.input.libraryItems
      );
      const weapons = runtime.input.pc.inventory
        .filter((item) => item.equipped)
        .flatMap((item) => {
          const catalog = runtime.input.libraryItems.find(
            (entry) => entry.id === item.libraryItemId
          );
          return catalog?.damage
            ? [`Attack with ${item.name}: ${catalog.damage}${catalog.damageType ? ` ${catalog.damageType}` : ""}`]
            : [];
        });
      const options = [...weapons, ...stats.specialActions];
      return options.length
        ? `ACTIONS|${options.join(";")}`
        : "ACTIONS|standard actions only: Attack, Dash, Disengage, Dodge, Help, Hide, Ready, Search, Use an Object, Grapple, Shove";
    },
  },
  {
    name: "get_check_modifier",
    description: "Get your exact modifier for a skill, ability check, or saving throw.",
    parameters: objectSchema(
      { check: stringArg("Check id or name, such as skill:Stealth, Stealth, or save:dex.") },
      ["check"]
    ),
    tier: "always",
    autonomy: "query",
    run: (args, runtime) => {
      const query = text(args.check).toLowerCase();
      const option = checkOptionsFor(
        runtime.input.pc,
        runtime.input.rules,
        runtime.input.libraryItems
      ).find(
        (entry) =>
          entry.id.toLowerCase() === query ||
          entry.shortLabel.toLowerCase() === query ||
          entry.label.toLowerCase().startsWith(query)
      );
      return option
        ? `CHECK|${option.id}|${option.shortLabel}|modifier=${formatMod(option.modifier)}`
        : `ERROR|unknown check ${text(args.check)}`;
    },
  },
  {
    name: "list_visible",
    description: "List creatures and objects you can currently perceive, with handles and positions.",
    parameters: objectSchema({}),
    tier: "always",
    autonomy: "query",
    run: (_args, runtime) => {
      const party: VisibleEntity[] = runtime.input.party
        .filter((entry) => entry.id !== runtime.input.pc.id)
        .map((value) => ({ value, isPC: true }))
        .filter((entry) => resolveVisible(handleForEntity(runtime.handles, entry.value.id), runtime));
      const tokens: VisibleEntity[] = runtime.input.tokens
        .map((value) => ({ value, isPC: false }))
        .filter((entry) => resolveVisible(handleForEntity(runtime.handles, entry.value.id), runtime));
      const visible = [...party, ...tokens].sort(
        (a, b) =>
          distanceFeet(runtime.input.pc, a.value) - distanceFeet(runtime.input.pc, b.value)
      );
      return visible.length
        ? ["VISIBLE|nearest first", ...visible.map((entry) => entityLine(entry, runtime))].join("\n")
        : "VISIBLE|nothing you can currently perceive";
    },
  },
  {
    name: "examine",
    description: "Inspect one visible creature or object more closely.",
    parameters: objectSchema({ id: stringArg("Visible handle such as tok_2 or pc_3.") }, ["id"]),
    tier: "situational",
    autonomy: "query",
    run: (args, runtime) => {
      const entity = resolveVisible(text(args.id), runtime);
      if (!entity) return "ERROR|target is unknown or not visible";
      const value = entity.value;
      const statuses = value.statuses
        .filter((status) => !["hidden", "invisible"].includes((status.effectId ?? status.name).toLowerCase()))
        .map((status) => status.name);
      const details = entity.isPC
        ? ""
        : [
            (value as MapToken).notes,
            ...(value as MapToken).traits.map((trait) => `${trait.name}: ${trait.description}`),
          ]
            .filter(Boolean)
            .join("; ");
      return [
        `EXAMINE|${entityLine(entity, runtime)}`,
        statuses.length ? `EFFECTS|${statuses.join(",")}` : "",
        details ? `DETAIL|${details}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "measure",
    description: "Measure distance and bearing to a visible handle or a map cell.",
    parameters: objectSchema({
      id: stringArg("Optional visible handle."),
      x: { type: "number", description: "Optional grid column." },
      y: { type: "number", description: "Optional grid row." },
    }),
    tier: "situational",
    autonomy: "query",
    run: (args, runtime) => {
      const id = text(args.id);
      const entity = id ? resolveVisible(id, runtime) : null;
      const cell = entity ? null : targetCell(args);
      const target = entity?.value ?? (cell ? { ...cell, width: 1, height: 1, bounds: [{ x: 0, y: 0 }] } : null);
      return target
        ? `MEASURE|distance=${distanceFeet(runtime.input.pc, target)}ft|bearing=${bearing(runtime.input.pc, target)}`
        : "ERROR|provide a visible id or x and y";
    },
  },
  {
    name: "path_to",
    description: "Estimate a straight grid path to a visible handle or map cell without moving.",
    parameters: objectSchema({
      id: stringArg("Optional visible handle."),
      x: { type: "number", description: "Optional destination grid column." },
      y: { type: "number", description: "Optional destination grid row." },
    }),
    tier: "situational",
    autonomy: "query",
    run: (args, runtime) => {
      const entity = text(args.id) ? resolveVisible(text(args.id), runtime) : null;
      const cell =
        targetCell(args) ??
        (entity ? { x: Math.round(entity.value.x), y: Math.round(entity.value.y) } : null);
      if (!cell) return "ERROR|provide a visible id or x and y";
      const destination = { ...cell, width: runtime.input.pc.width, height: runtime.input.pc.height, bounds: runtime.input.pc.bounds };
      const feet =
        Math.max(
          Math.abs(runtime.input.pc.x - destination.x),
          Math.abs(runtime.input.pc.y - destination.y)
        ) * 5;
      const speed = calculateCreatureStats(
        runtime.input.pc,
        runtime.input.rules,
        runtime.input.libraryItems
      ).speed;
      const leavesReach = runtime.input.tokens
        .filter(
          (token) =>
            token.kind !== "object" &&
            token.stance === "hostile" &&
            observerCanPerceive(
              runtime.input.pc,
              token,
              runtime.input.rules,
              runtime.input.libraryItems,
              runtime.input.settings.perceptionRadius
            ) &&
            distanceFeet(runtime.input.pc, token) <= 5 &&
            distanceFeet(destination, token) > 5
        )
        .map((token) => handleForEntity(runtime.handles, token.id));
      return [
        `PATH|to=${cell.x},${cell.y}|distance=${feet}ft|speed=${speed}ft|withinSpeed=${feet <= speed ? "yes" : "no"}`,
        "PATH-NOTE|straight grid estimate; walls and difficult terrain are not modeled",
        leavesReach.length ? `LEAVES-REACH|${leavesReach.join(",")}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    },
  },
  {
    name: "line_of_sight",
    description: "Check whether a target is perceptible; wall occlusion is not modeled.",
    parameters: objectSchema({ id: stringArg("Visible handle to check.") }, ["id"]),
    tier: "situational",
    autonomy: "query",
    run: (args, runtime) =>
      resolveVisible(text(args.id), runtime)
        ? "LINE-OF-SIGHT|perceptible=yes|occlusion=unknown|cover=unknown"
        : "LINE-OF-SIGHT|perceptible=no|occlusion=unknown|cover=unknown",
  },
  {
    name: "say",
    description: "Speak in character. Use this instead of repeating speech in the final answer.",
    parameters: objectSchema(
      { text: stringArg("Words to speak."), to: stringArg("Optional visible handle being addressed.") },
      ["text"]
    ),
    tier: "always",
    autonomy: "actions",
    run: (args, runtime) => {
      const words = text(args.text);
      if (!words) return "ERROR|speech was empty";
      const to = text(args.to);
      const delivered = to ? `${words} (to ${to})` : words;
      if (intentMode(runtime, "actions") === "propose") {
        emit(runtime, "actions", "action", "SAY", delivered, {
          payload: { operation: "say", value: delivered },
        });
        return "SAY|proposed";
      }
      runtime.say(delivered);
      return "SAY|delivered";
    },
  },
  {
    name: "emote",
    description: "Describe a small physical expression that does not move the token or resolve an outcome.",
    parameters: objectSchema({ text: stringArg("Short physical expression.") }, ["text"]),
    tier: "always",
    autonomy: "actions",
    run: (args, runtime) => {
      const action = text(args.text).replace(/^\*|\*$/g, "");
      if (!action) return "ERROR|emote was empty";
      if (intentMode(runtime, "actions") === "propose") {
        emit(runtime, "actions", "action", "EMOTE", action, {
          payload: { operation: "emote", value: action },
        });
        return "EMOTE|proposed";
      }
      runtime.emote(action);
      return "EMOTE|delivered";
    },
  },
  {
    name: "declare_move",
    description: "Declare where you want to move. The GM remains in control of the board.",
    parameters: objectSchema({
      towards: stringArg("Optional visible handle to move toward."),
      x: { type: "number", description: "Optional destination grid column." },
      y: { type: "number", description: "Optional destination grid row." },
      feet: { type: "number", description: "Optional intended movement distance." },
      reason: stringArg("Why you want to move."),
    }),
    tier: "always",
    autonomy: "movement",
    run: (args, runtime) => {
      if (runtime.movementDeclared) {
        return "MOVE|not applied|you already declared movement this turn";
      }
      const towards = text(args.towards);
      const target = towards ? resolveVisible(towards, runtime) : null;
      const cell = targetCell(args);
      const feet = finite(args.feet);
      const detail = [
        cell
          ? `to ${cell.x},${cell.y}`
          : target
            ? `toward ${towards}`
            : "to a safer position",
        feet !== null ? `${Math.max(0, Math.round(feet))}ft` : "",
        text(args.reason),
      ]
        .filter(Boolean)
        .join(" — ");
      if (intentMode(runtime, "movement") === "auto" && cell) {
        const live = runtime.getLiveState();
        const destination = {
          ...live.pc,
          x: cell.x,
          y: cell.y,
        };
        const speed = calculateCreatureStats(
          live.pc,
          runtime.input.rules,
          runtime.input.libraryItems
        ).speed;
        const distance =
          Math.max(
            Math.abs(live.pc.x - destination.x),
            Math.abs(live.pc.y - destination.y)
          ) * 5;
        if (runtime.movementSpent + distance > speed) {
          return `MOVE|not applied|distance ${distance}ft exceeds ${speed - runtime.movementSpent}ft remaining`;
        }
        const occupied = new Set(
          [...live.party, ...live.tokens]
            .filter((entry) => entry.id !== live.pc.id)
            .flatMap(occupiedWorldCells)
            .map((occupiedCell) => `${occupiedCell.x}:${occupiedCell.y}`)
        );
        if (
          occupiedWorldCells(destination).some((occupiedCell) =>
            occupied.has(`${occupiedCell.x}:${occupiedCell.y}`)
          )
        ) {
          return "MOVE|not applied|destination is occupied";
        }
        runtime.movePC(cell);
        runtime.movementDeclared = true;
        runtime.movementSpent += distance;
        runtime.input.pc.x = cell.x;
        runtime.input.pc.y = cell.y;
        return `MOVE|applied|${detail}`;
      }
      runtime.movementDeclared = true;
      emit(runtime, "movement", "move", "MOVE", detail, cell ? { targetCell: cell } : {});
      return `MOVE|announced|${detail}`;
    },
  },
  {
    name: "declare_action",
    description: "Declare a tabletop action without deciding its outcome.",
    parameters: objectSchema(
      {
        type: stringArg("Action type.", [
          "Attack",
          "Cast",
          "Dash",
          "Disengage",
          "Dodge",
          "Help",
          "Hide",
          "Ready",
          "Search",
          "Use an Object",
          "Grapple",
          "Shove",
        ]),
        target: stringArg("Optional visible target handle."),
        detail: stringArg("How you attempt the action."),
      },
      ["type", "detail"]
    ),
    tier: "always",
    autonomy: "actions",
    run: (args, runtime) => {
      const action = text(args.type) || "ACTION";
      const target = text(args.target);
      const detail = [text(args.detail), target ? `target ${target}` : ""].filter(Boolean).join(" — ");
      if (intentMode(runtime, "actions") === "auto") {
        runtime.emote(`${action}${detail ? `: ${detail}` : ""}`);
        return `ACTION|delivered|${action}`;
      }
      emit(runtime, "actions", "action", action.toUpperCase(), detail || action);
      return `ACTION|announced|${action}`;
    },
  },
  {
    name: "request_roll",
    description: "Ask the GM for a skill check, ability check, or saving throw.",
    parameters: objectSchema(
      {
        check: stringArg("Check id such as skill:Perception or save:dex."),
        reason: stringArg("What the roll would establish."),
      },
      ["check", "reason"]
    ),
    tier: "always",
    autonomy: "rolls",
    run: async (args, runtime) => {
      const check = text(args.check);
      const reason = text(args.reason);
      if (intentMode(runtime, "rolls") === "auto") {
        return runtime.rollCheck(check, reason);
      }
      emit(runtime, "rolls", "roll", "ROLL?", `${check} — ${reason}`, { checkId: check });
      return `ROLL|requested|${check}`;
    },
  },
  {
    name: "ask_gm",
    description: "Ask the Game Master for missing information instead of inventing it.",
    parameters: objectSchema({ question: stringArg("Question for the GM.") }, ["question"]),
    tier: "always",
    autonomy: "actions",
    run: (args, runtime) => {
      const question = text(args.question);
      if (intentMode(runtime, "actions") === "auto") {
        runtime.say(question);
        return "ASK-GM|delivered";
      }
      emit(runtime, "actions", "ask", "GM?", question);
      return "ASK-GM|announced";
    },
  },
  {
    name: "end_turn",
    description:
      "Signal that you have no more declarations. During combat on your own turn this passes initiative to the next combatant.",
    parameters: objectSchema({ reason: stringArg("Optional short reason.") }),
    tier: "always",
    autonomy: "actions",
    run: (args, runtime) => {
      const reason = text(args.reason);
      const advanced = runtime.endTurn?.() ?? false;
      const outcome = advanced
        ? "TURN|ended|initiative passed to the next combatant"
        : "TURN|ended|initiative is GM-controlled";
      if (intentMode(runtime, "actions") === "auto") {
        runtime.emote(reason || "ends their moment");
        return outcome;
      }
      emit(runtime, "actions", "action", "DONE", reason || "Ends their moment.");
      return outcome;
    },
  },
  {
    name: "equip",
    description: "Equip one item from your inventory.",
    parameters: objectSchema({ item: stringArg("Inventory item id from get_inventory.") }, ["item"]),
    tier: "situational",
    autonomy: "bookkeeping",
    run: (args, runtime) => {
      const id = text(args.item);
      const livePC = runtime.getLiveState().pc;
      const item = livePC.inventory.find((entry) => entry.id === id);
      if (!item) return "ERROR|inventory item not found";
      if (intentMode(runtime, "bookkeeping") !== "auto") {
        emit(runtime, "bookkeeping", "bookkeeping", "EQUIP", item.name, {
          payload: { operation: "equip", itemId: item.id },
        });
        return `EQUIP|announced|${item.name}`;
      }
      applyPCPatch(runtime, {
        inventory: assignEquipmentSlots(
          livePC.inventory.map((entry) =>
            entry.id === id ? { ...entry, equipped: true } : entry
          ),
          runtime.input.libraryItems
        ),
      });
      const equipped = runtime.getLiveState().pc.inventory.find((entry) => entry.id === id);
      return equipped?.equipped
        ? `EQUIP|applied|${item.name}`
        : `EQUIP|not applied|no compatible equipment slot for ${item.name}`;
    },
  },
  {
    name: "unequip",
    description: "Unequip one item from your inventory.",
    parameters: objectSchema({ item: stringArg("Inventory item id from get_inventory.") }, ["item"]),
    tier: "situational",
    autonomy: "bookkeeping",
    run: (args, runtime) => {
      const id = text(args.item);
      const livePC = runtime.getLiveState().pc;
      const item = livePC.inventory.find((entry) => entry.id === id);
      if (!item) return "ERROR|inventory item not found";
      if (intentMode(runtime, "bookkeeping") !== "auto") {
        emit(runtime, "bookkeeping", "bookkeeping", "UNEQUIP", item.name, {
          payload: { operation: "unequip", itemId: item.id },
        });
        return `UNEQUIP|announced|${item.name}`;
      }
      applyPCPatch(runtime, {
        inventory: livePC.inventory.map((entry) =>
          entry.id === id ? { ...entry, equipped: false, equippedSlot: undefined } : entry
        ),
      });
      return `UNEQUIP|applied|${item.name}`;
    },
  },
  {
    name: "remember",
    description: "Add one private fact to your own long-term knowledge.",
    parameters: objectSchema({ text: stringArg("Concise fact worth remembering.") }, ["text"]),
    tier: "situational",
    autonomy: "bookkeeping",
    run: (args, runtime) => {
      const memory = text(args.text);
      if (!memory) return "ERROR|memory was empty";
      if (intentMode(runtime, "bookkeeping") !== "auto") {
        emit(runtime, "bookkeeping", "bookkeeping", "REMEMBER", memory, {
          payload: { operation: "remember", value: memory },
        });
        return "REMEMBER|announced";
      }
      applyPCPatch(runtime, {
        knowledge: [runtime.getLiveState().pc.knowledge.trim(), memory]
          .filter(Boolean)
          .join("\n"),
      });
      return "REMEMBER|saved privately";
    },
  },
  {
    name: "set_goal",
    description: "Set or replace your private current goal for future turns.",
    parameters: objectSchema({ text: stringArg("Short current objective; empty clears it.") }, ["text"]),
    tier: "always",
    autonomy: "bookkeeping",
    run: (args, runtime) => {
      const goal = text(args.text);
      if (intentMode(runtime, "bookkeeping") !== "auto") {
        emit(runtime, "bookkeeping", "bookkeeping", "GOAL", goal || "Clear current goal", {
          payload: { operation: "set_goal", value: goal },
        });
        return "GOAL|announced";
      }
      applyPCPatch(runtime, { goal });
      return goal ? `GOAL|saved|${goal}` : "GOAL|cleared";
    },
  },
];

export function createPCToolRuntime(
  input: PCContextInput,
  gameplay: GameplaySettings,
  callbacks: Omit<
    PCToolRuntime,
    "input" | "handles" | "gameplay" | "movementDeclared" | "movementSpent"
  > & { endTurn?: () => boolean }
): PCToolRuntime {
  return {
    input: { ...input, pc: { ...input.pc } },
    handles: input.handles ?? createEntityHandles(input.pc, input.party, input.tokens),
    gameplay,
    movementDeclared: false,
    movementSpent: 0,
    ...callbacks,
  };
}

export function enabledPCTools(gameplay: GameplaySettings): PCToolDefinition[] {
  if (!gameplay.toolsEnabled) return [];
  return PC_TOOLS.filter((tool) => {
    if (tool.autonomy === "query") return true;
    if (tool.autonomy === "movement") return Boolean(gameplay.movement);
    if (tool.autonomy === "rolls") return Boolean(gameplay.rolls);
    if (tool.autonomy === "bookkeeping") return Boolean(gameplay.bookkeeping);
    return Boolean(gameplay.actions);
  });
}

export function estimateToolSchemaTokens(tools: PCToolDefinition[] = PC_TOOLS): number {
  return Math.ceil(
    tools.reduce(
      (sum, tool) =>
        sum + JSON.stringify({ name: tool.name, description: tool.description, parameters: tool.parameters }).length,
      0
    ) / 4
  );
}
