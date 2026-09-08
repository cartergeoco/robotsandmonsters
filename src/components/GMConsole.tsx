import { Loader2, MessageCircle, Send, Trash2, X } from "lucide-react";
import { useDiceRoll, type RollResult } from "react-ttrpg-dice";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { generatePCResponse } from "../ai";
import { useRAM } from "../store";
import { rollDie } from "../util";
import type { DiceLook } from "../types";
import {
  RamConfirmDialog,
  RamIconButton,
  RamInput,
  RamPanel,
  RamPanelHeader,
} from "./ui/RamPrimitives";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
type DieSides = (typeof DICE)[number];

const emptyDiceSelection = () =>
  Object.fromEntries(DICE.map((sides) => [sides, 0])) as Record<DieSides, number>;

const DICE_LOOK_CONFIG: Record<
  DiceLook,
  {
    theme: "obsidian" | "ivory" | "crimson" | "glass" | "metal";
    dieColor: string;
    numberColor: string;
    accentColor: string;
    roughness: number;
    metalness: number;
  }
> = {
  default: {
    theme: "ivory",
    dieColor: "#f4efe6",
    numberColor: "#2a2a2a",
    accentColor: "#c4b8a0",
    roughness: 0.42,
    metalness: 0.08,
  },
  monotone: {
    theme: "obsidian",
    dieColor: "#d8d8d8",
    numberColor: "#1a1a1a",
    accentColor: "#9a9a9a",
    roughness: 0.85,
    metalness: 0.05,
  },
  glossy: {
    theme: "metal",
    dieColor: "#f7f4ee",
    numberColor: "#2a2a2a",
    accentColor: "#c8b89a",
    roughness: 0.12,
    metalness: 0.72,
  },
  glass: {
    theme: "glass",
    dieColor: "#e8f0f8",
    numberColor: "#1a1a1a",
    accentColor: "#a8c4d8",
    roughness: 0.08,
    metalness: 0.2,
  },
};

function naturalOutcomes(result: RollResult) {
  const d20s = result.rolls.filter((die) => die.type === "d20");
  return {
    crits: d20s.filter((die) => die.value === 20).length,
    fumbles: d20s.filter((die) => die.value === 1).length,
  };
}

function logDiceResult(result: RollResult) {
  const state = useRAM.getState();
  const details = result.rolls.map((die) => die.value).join(", ");
  const { crits, fumbles } = naturalOutcomes(result);
  const extras = [
    crits > 0 ? `${crits === 1 ? "Natural 20" : `${crits} natural 20s`}` : "",
    fumbles > 0 ? `${fumbles === 1 ? "Natural 1" : `${fumbles} natural 1s`}` : "",
  ].filter(Boolean);
  const outcome = extras.length ? ` — ${extras.join(", ")}` : "";
  state.addLog({
    role: "system",
    author: "Dice",
    text: state.uiSettings.showDiceDetails
      ? `${result.notation} → ${result.rolls.length > 1 ? `[${details}] = ` : ""}${result.total}${outcome}`
      : `${result.notation} → ${result.total} total${outcome}`,
  });
}

function DiceTray({
  look,
  motion,
}: {
  look: DiceLook;
  motion: "system" | "reduced";
}) {
  const [dice, setDice] = useState<Record<DieSides, number>>(emptyDiceSelection);
  const [fx, setFx] = useState<"crit" | "fumble" | null>(null);
  const [dissolving, setDissolving] = useState(false);
  const lookConfig = DICE_LOOK_CONFIG[look];
  const { roll, isRolling, result, DiceOverlayPortal } = useDiceRoll({
    config: lookConfig,
    cameraAngle: { x: 1.2, z: 2.4 },
    sound: { volume: 0.28 },
    zIndex: 80,
    onRollComplete: (value) => {
      const { crits, fumbles } = naturalOutcomes(value);
      setFx(crits > 0 ? "crit" : fumbles > 0 ? "fumble" : null);
      logDiceResult(value);
    },
  });

  useEffect(() => {
    if (isRolling) {
      setDissolving(false);
      setFx(null);
      return;
    }
    if (!result) return;
    const dissolveAt = window.setTimeout(() => setDissolving(true), 1500);
    const clearFx = window.setTimeout(() => setFx(null), 2400);
    return () => {
      window.clearTimeout(dissolveAt);
      window.clearTimeout(clearFx);
    };
  }, [isRolling, result]);

  const diceNotation = DICE.filter((sides) => dice[sides] > 0)
    .map((sides) => `${dice[sides]}d${sides}`)
    .join(" + ");

  function addDie(sides: DieSides) {
    setDice((current) => ({
      ...current,
      [sides]: Math.min(20, current[sides] + 1),
    }));
  }

  function rollSelected() {
    if (!diceNotation || isRolling) return;
    if (motion === "reduced") {
      const rolls = DICE.flatMap((sides) =>
        Array.from({ length: dice[sides] }, () => {
          const value = rollDie(sides);
          return {
            type: `d${sides}` as RollResult["rolls"][number]["type"],
            value,
            isMax: value === sides,
            isMin: value === 1,
          };
        })
      );
      const next: RollResult = {
        notation: diceNotation,
        total: rolls.reduce((sum, die) => sum + die.value, 0),
        rolls,
      };
      const { crits, fumbles } = naturalOutcomes(next);
      setFx(crits > 0 ? "crit" : fumbles > 0 ? "fumble" : null);
      logDiceResult(next);
      setDice(emptyDiceSelection());
      return;
    }
    roll(diceNotation);
    setDice(emptyDiceSelection());
  }

  return (
    <>
      <div className="dice-cluster" data-dice-look={look}>
        <div className="dice-row">
          {DICE.map((d) => (
            <button
              className={`dice-button dice-button--${d}${dice[d] > 0 ? " is-selected" : ""}`}
              key={d}
              disabled={isRolling}
              onClick={() => addDie(d)}
              aria-label={`Add d${d}${dice[d] ? `, ${dice[d]} selected` : ""}`}
            >
              <span>d{d}</span>
              {dice[d] > 0 && <strong>{dice[d]}</strong>}
            </button>
          ))}
        </div>
        {diceNotation && (
          <RamIconButton label="Clear selected dice" onClick={() => setDice(emptyDiceSelection())}>
            <X size={14} strokeWidth={1.5} />
          </RamIconButton>
        )}
        <button className="roll-button" disabled={!diceNotation || isRolling} onClick={rollSelected}>
          {isRolling ? "Rolling" : "Roll"}
        </button>
      </div>
      {(DiceOverlayPortal || fx) &&
        createPortal(
        <div
          className={`dice-stage${dissolving ? " is-dissolving" : ""}${fx ? ` dice-stage--${fx}` : ""}`}
          aria-hidden="true"
        >
          {DiceOverlayPortal}
          {fx && (
            <div className={`dice-fx dice-fx--${fx}`}>
              <span>{fx === "crit" ? "Natural 20" : "Natural 1"}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

export function GMConsole() {
  const log = useRAM((s) => s.log);
  const pcs = useRAM((s) => s.pcs);
  const thinking = useRAM((s) => s.thinking);
  const addLog = useRAM((s) => s.addLog);
  const clearLog = useRAM((s) => s.clearLog);
  const ui = useRAM((s) => s.uiSettings);
  const [draft, setDraft] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ui.autoScrollConsole) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, ui.autoScrollConsole]);

  function sendGM() {
    const text = draft.trim();
    if (!text) return;
    addLog({ role: "gm", author: "GM", text });
    setDraft("");
  }

  async function askPC(pcId: string) {
    const s = useRAM.getState();
    const pc = s.pcs.find((p) => p.id === pcId);
    if (!pc || s.thinking.includes(pcId)) return;
    s.setThinking(pcId, true);
    try {
      const text = await generatePCResponse(
        pc,
        s.pcs,
        s.log,
        s.settings,
        s.ruleDefinitions,
        s.customLibraryItems
      );
      useRAM.getState().addLog({
        role: "pc",
        author: pc.name,
        authorId: pc.id,
        color: pc.color,
        text,
      });
    } catch (err) {
      useRAM.getState().addLog({
        role: "system",
        author: "System",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      useRAM.getState().setThinking(pcId, false);
    }
  }

  function clearConsole() {
    if (ui.confirmClearConsole) {
      setConfirmClearOpen(true);
      return;
    }
    clearLog();
  }

  return (
    <>
      <RamPanel className="gm-console">
      <RamPanelHeader
        title="Console"
        actions={
          <RamIconButton
            label="Clear console"
            variant="danger"
            disabled={log.length === 0}
            onClick={clearConsole}
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </RamIconButton>
        }
      />
      <div className="gm-body">
        <div className="log-scroll" ref={scrollRef}>
          {log.map((e) => (
            <div className={`log-entry ${e.role}`} key={e.id}>
              <span className="log-copy">
                <span
                  className="log-author"
                  style={e.color ? { color: e.color } : undefined}
                >
                  {e.author === "RAM" ? "System" : e.author}
                  <time>
                    {new Date(e.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12:
                        ui.timeFormat === "12-hour"
                          ? true
                          : ui.timeFormat === "24-hour"
                            ? false
                            : undefined,
                    })}
                  </time>
                </span>
                <span className="log-text">{e.text}</span>
              </span>
            </div>
          ))}
        </div>
        <div className="gm-side">
          <span className="gm-side__label">Ask a character</span>
          {pcs.length === 0 && (
            <span className="gm-side__empty">
              Add a character first.
            </span>
          )}
          {pcs.map((pc) => {
            const busy = thinking.includes(pc.id);
            return (
              <button
                key={pc.id}
                className="player-action"
                disabled={busy}
                onClick={() => askPC(pc.id)}
              >
                {busy ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <span className="player-action__avatar" style={{ color: pc.color }}>
                    {pc.portrait ? (
                      <img src={pc.portrait} alt="" />
                    ) : (
                      pc.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                )}
                <span className="player-action__name">{pc.name}</span>
                <MessageCircle
                  className="player-action__indicator"
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="gm-input-row">
        <DiceTray
          key={ui.diceLook}
          look={ui.diceLook}
          motion={ui.motion}
        />
        <div className="command-field">
          <RamInput
            placeholder="Describe what happens…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendGM();
            }}
          />
          <RamIconButton label="Send to console" variant="brass" onClick={sendGM}>
            <Send size={16} strokeWidth={1.5} />
          </RamIconButton>
        </div>
      </div>
      </RamPanel>
      <RamConfirmDialog
        open={confirmClearOpen}
        title="Clear console?"
        description="Every console message will be removed. This cannot be undone."
        confirmLabel="Clear"
        onConfirm={clearLog}
        onClose={() => setConfirmClearOpen(false)}
      />
    </>
  );
}
