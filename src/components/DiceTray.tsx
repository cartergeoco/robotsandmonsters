import { X } from "lucide-react";
import { useDiceRoll, type RollResult } from "react-ttrpg-dice";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { instantD20Result, subscribeD20Roll } from "../diceRolls";
import { useRAM } from "../store";
import { rollDie } from "../util";
import { RamIconButton } from "./ui/RamPrimitives";

const DICE = [4, 6, 8, 10, 12, 20, 100] as const;
type DieSides = (typeof DICE)[number];

const emptyDiceSelection = () =>
  Object.fromEntries(DICE.map((sides) => [sides, 0])) as Record<DieSides, number>;

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

export function DiceTray({
  motion,
}: {
  motion: "system" | "full" | "reduced";
}) {
  const diceAnimations = useRAM((state) => state.uiSettings.diceAnimations);
  const [dice, setDice] = useState<Record<DieSides, number>>(emptyDiceSelection);
  const [fx, setFx] = useState<"crit" | "fumble" | null>(null);
  const [dissolving, setDissolving] = useState(false);
  const pendingExternal = useRef<((result: RollResult) => void) | null>(null);
  const pendingQueue = useRef<Array<(result: RollResult) => void>>([]);
  const reduced =
    !diceAnimations ||
    motion === "reduced" ||
    (motion === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const { roll, isRolling, result, DiceOverlayPortal } = useDiceRoll({
    zIndex: 80,
    onRollComplete: (value) => {
      const { crits, fumbles } = naturalOutcomes(value);
      setFx(crits > 0 ? "crit" : fumbles > 0 ? "fumble" : null);
      const external = pendingExternal.current;
      pendingExternal.current = null;
      if (external) external(value);
      else logDiceResult(value);
    },
  });

  const rollingRef = useRef(isRolling);
  rollingRef.current = isRolling;
  const rollRef = useRef(roll);
  rollRef.current = roll;

  useEffect(() => {
    function startNext() {
      if (rollingRef.current || pendingExternal.current) return;
      const onComplete = pendingQueue.current.shift();
      if (!onComplete) return;
      if (reduced) {
        const next = instantD20Result();
        const { crits, fumbles } = naturalOutcomes(next);
        setFx(crits > 0 ? "crit" : fumbles > 0 ? "fumble" : null);
        onComplete(next);
        startNext();
        return;
      }
      pendingExternal.current = onComplete;
      rollRef.current("1d20");
    }

    return subscribeD20Roll(({ onComplete }) => {
      pendingQueue.current.push(onComplete);
      startNext();
      return true;
    });
  }, [reduced]);

  useEffect(() => {
    if (isRolling || pendingExternal.current || !pendingQueue.current.length) return;
    const onComplete = pendingQueue.current.shift();
    if (!onComplete) return;
    if (reduced) {
      const next = instantD20Result();
      const { crits, fumbles } = naturalOutcomes(next);
      setFx(crits > 0 ? "crit" : fumbles > 0 ? "fumble" : null);
      onComplete(next);
      return;
    }
    pendingExternal.current = onComplete;
    rollRef.current("1d20");
  }, [isRolling, reduced]);

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
    if (reduced) {
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
      <div className="dice-cluster">
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
