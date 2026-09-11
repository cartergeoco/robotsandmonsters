import type { RollResult } from "react-ttrpg-dice";
import { rollDie } from "./util";

export type D20RollHandler = (request: {
  onComplete: (result: RollResult) => void;
}) => boolean;

const handlers = new Set<D20RollHandler>();

export function subscribeD20Roll(handler: D20RollHandler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function instantD20Result(): RollResult {
  const value = rollDie(20);
  return {
    notation: "1d20",
    total: value,
    rolls: [
      {
        type: "d20",
        value,
        isMax: value === 20,
        isMin: value === 1,
      },
    ],
  };
}

export function d20FromResult(result: RollResult): number {
  return result.rolls.find((die) => die.type === "d20")?.value ?? result.total;
}

/** Ask the mounted dice tray to animate one or more d20s. Falls back to instant rolls. */
export function requestD20Rolls(onCompletes: Array<(result: RollResult) => void>): void {
  for (const onComplete of onCompletes) {
    let handled = false;
    for (const handler of handlers) {
      if (handler({ onComplete })) {
        handled = true;
        break;
      }
    }
    if (!handled) onComplete(instantD20Result());
  }
}

/** Ask the mounted dice tray to animate a d20. Falls back to an instant roll. */
export function requestD20Roll(onComplete: (result: RollResult) => void): void {
  requestD20Rolls([onComplete]);
}
