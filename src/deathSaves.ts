import {
  STATUS_EFFECT_PRESETS,
  emptyDeathSaves,
  normalizeDeathSaves,
  type CreatureMechanics,
  type DeathSaveState,
  type StatusEffect,
} from "./types";

const uid = () => crypto.randomUUID();

export function creatureUsesDeathSaves(
  creature: CreatureMechanics & { kind?: string; stance?: string }
): boolean {
  if (!("kind" in creature) || !creature.kind) return true;
  if (creature.kind === "object" || creature.creatureType === "object") return false;
  if (creature.kind === "enemy" || creature.stance === "hostile") return false;
  return creature.maxHp > 0;
}

export function deathSaveState(creature: Pick<CreatureMechanics, "deathSaves">): DeathSaveState {
  return normalizeDeathSaves(creature.deathSaves);
}

export function isDead(creature: Pick<CreatureMechanics, "hp" | "deathSaves">): boolean {
  return deathSaveState(creature).dead;
}

export function isDying(creature: Pick<CreatureMechanics, "hp" | "deathSaves">): boolean {
  const saves = deathSaveState(creature);
  return creature.hp <= 0 && !saves.dead && !saves.stable;
}

export function isStable(creature: Pick<CreatureMechanics, "hp" | "deathSaves">): boolean {
  const saves = deathSaveState(creature);
  return creature.hp <= 0 && saves.stable && !saves.dead;
}

export function deathConditionLabel(
  creature: Pick<CreatureMechanics, "hp" | "deathSaves">
): string | null {
  const saves = deathSaveState(creature);
  if (saves.dead) return "Dead";
  if (creature.hp > 0) return null;
  if (saves.stable) return "Stable";
  return `Dying ${saves.successes}/3 · ${saves.failures}/3`;
}

function withUnconscious(statuses: StatusEffect[] | undefined): StatusEffect[] {
  const current = statuses ?? [];
  if (current.some((status) => status.effectId === "unconscious")) return current;
  const preset = STATUS_EFFECT_PRESETS.find((entry) => entry.id === "unconscious");
  if (!preset) return current;
  return [
    ...current,
    {
      id: uid(),
      effectId: preset.id,
      name: preset.name,
      kind: preset.kind,
      color: preset.color,
      note: "",
    },
  ];
}

function withoutUnconscious(statuses: StatusEffect[] | undefined): StatusEffect[] {
  return (statuses ?? []).filter((status) => status.effectId !== "unconscious");
}

export interface HpChangeResult<T extends CreatureMechanics> {
  creature: T;
  log: string | null;
  floater: { title: string; detail: string; outcome: "success" | "fail" | "info" } | null;
}

function markDead<T extends CreatureMechanics>(creature: T): T {
  return {
    ...creature,
    hp: 0,
    deathSaves: { successes: 0, failures: 3, stable: false, dead: true },
    statuses: withUnconscious(creature.statuses),
  };
}

function markDying<T extends CreatureMechanics>(creature: T): T {
  return {
    ...creature,
    hp: 0,
    deathSaves: emptyDeathSaves(),
    statuses: withUnconscious(creature.statuses),
  };
}

function markConscious<T extends CreatureMechanics>(creature: T, hp: number): T {
  return {
    ...creature,
    hp,
    deathSaves: emptyDeathSaves(),
    statuses: withoutUnconscious(creature.statuses),
  };
}

export function healFully<T extends CreatureMechanics>(creature: T): HpChangeResult<T> {
  const maxHp = Math.max(0, creature.maxHp);
  const saves = deathSaveState(creature);
  if (creature.hp === maxHp && !saves.dead && !saves.stable && creature.hp > 0) {
    return { creature, log: null, floater: null };
  }
  const wasDown = creature.hp <= 0 || saves.dead || saves.stable;
  const updated = markConscious(creature, maxHp);
  return {
    creature: updated,
    log: wasDown ? `healed to ${maxHp} HP — conscious` : `healed to ${maxHp} HP`,
    floater: {
      title: wasDown ? "CONSCIOUS" : "HEAL",
      detail: `Full · ${maxHp} HP`,
      outcome: "success",
    },
  };
}

export function dropToDeathSaves<T extends CreatureMechanics>(
  creature: T,
  usesDeathSaves: boolean
): HpChangeResult<T> {
  const saves = deathSaveState(creature);
  if (usesDeathSaves) {
    if (creature.hp <= 0) {
      return { creature, log: null, floater: null };
    }
    const updated = markDying(creature);
    return {
      creature: updated,
      log: "dropped to 0 HP — dying",
      floater: { title: "DYING", detail: "Death saves", outcome: "info" },
    };
  }
  if (saves.dead || (creature.hp <= 0 && !usesDeathSaves)) {
    return { creature: saves.dead ? creature : markDead(creature), log: null, floater: null };
  }
  const updated = markDead(creature);
  return {
    creature: updated,
    log: "dropped to 0 HP — dead",
    floater: { title: "DEAD", detail: "0 HP", outcome: "fail" },
  };
}

export function applyHpChange<T extends CreatureMechanics>(
  creature: T,
  delta: number,
  options: { usesDeathSaves: boolean }
): HpChangeResult<T> {
  const maxHp = Math.max(0, creature.maxHp);
  const prevHp = creature.hp;
  const requested = Math.max(0, prevHp + delta);
  const saves = deathSaveState(creature);

  if (delta === 0 && requested === prevHp) {
    return { creature, log: null, floater: null };
  }

  if (delta < 0) {
    if (saves.dead) {
      return { creature: { ...creature, hp: 0 }, log: null, floater: null };
    }

    if (prevHp <= 0 && options.usesDeathSaves) {
      const next = addDeathSaveFailures({ ...saves, stable: false }, 1);
      const updated = {
        ...creature,
        hp: 0,
        deathSaves: next,
        statuses: withUnconscious(creature.statuses),
      };
      if (next.dead) {
        return {
          creature: updated,
          log: "damage while dying — dead",
          floater: { title: "DEAD", detail: "3 failures", outcome: "fail" },
        };
      }
      return {
        creature: updated,
        log: `damage while ${saves.stable ? "stable" : "dying"} — death save fail ${next.failures}/3`,
        floater: {
          title: "DEATH SAVE",
          detail: `Fail ${next.failures}/3`,
          outcome: "fail",
        },
      };
    }

    if (requested <= 0 && prevHp > 0) {
      const massive = -delta >= maxHp && maxHp > 0;
      if (!options.usesDeathSaves || massive) {
        const updated = markDead(creature);
        return {
          creature: updated,
          log: massive ? "massive damage — dead" : "dropped to 0 HP — dead",
          floater: { title: "DEAD", detail: massive ? "Massive damage" : "0 HP", outcome: "fail" },
        };
      }
      const updated = markDying(creature);
      return {
        creature: updated,
        log: "dropped to 0 HP — dying",
        floater: { title: "DYING", detail: "Death saves", outcome: "info" },
      };
    }
  }

  if (delta > 0 && requested > 0) {
    const wasDown = prevHp <= 0 || saves.dead || saves.stable;
    const updated = markConscious(creature, requested);
    return {
      creature: updated,
      log: wasDown ? `healed to ${requested} HP — conscious` : null,
      floater: wasDown
        ? { title: "CONSCIOUS", detail: `${requested} HP`, outcome: "success" }
        : null,
    };
  }

  return { creature: { ...creature, hp: requested }, log: null, floater: null };
}

export function addDeathSaveFailures(state: DeathSaveState, count: number): DeathSaveState {
  const failures = Math.min(3, state.failures + Math.max(0, count));
  return {
    successes: state.successes,
    failures,
    stable: false,
    dead: failures >= 3,
  };
}

export interface DeathSaveRollResult<T extends CreatureMechanics> {
  creature: T;
  d20: number;
  title: string;
  detail: string;
  outcome: "success" | "fail" | "info";
  log: string;
}

export function applyDeathSaveRoll<T extends CreatureMechanics>(
  creature: T,
  d20: number
): DeathSaveRollResult<T> {
  const current = deathSaveState(creature);

  if (d20 === 20) {
    const updated = markConscious(creature, 1);
    return {
      creature: updated,
      d20,
      title: "DEATH SAVE",
      detail: "Nat 20 · 1 HP",
      outcome: "success",
      log: `death save 20 — stands with 1 HP`,
    };
  }

  if (d20 === 1) {
    const next = addDeathSaveFailures(current, 2);
    const updated = {
      ...creature,
      hp: 0,
      deathSaves: next,
      statuses: withUnconscious(creature.statuses),
    };
    return {
      creature: updated,
      d20,
      title: "DEATH SAVE",
      detail: next.dead ? "Nat 1 · Dead" : `Nat 1 · Fail ${next.failures}/3`,
      outcome: "fail",
      log: next.dead
        ? "death save 1 — two failures, dead"
        : `death save 1 — two failures (${next.failures}/3)`,
    };
  }

  if (d20 >= 10) {
    const successes = Math.min(3, current.successes + 1);
    const stable = successes >= 3;
    const next: DeathSaveState = {
      successes,
      failures: current.failures,
      stable,
      dead: false,
    };
    const updated = {
      ...creature,
      hp: 0,
      deathSaves: next,
      statuses: withUnconscious(creature.statuses),
    };
    return {
      creature: updated,
      d20,
      title: "DEATH SAVE",
      detail: stable ? `${d20} · Stable` : `${d20} · ${successes}/3`,
      outcome: "success",
      log: stable
        ? `death save ${d20} — three successes, stable`
        : `death save ${d20} — success ${successes}/3`,
    };
  }

  const next = addDeathSaveFailures(current, 1);
  const updated = {
    ...creature,
    hp: 0,
    deathSaves: next,
    statuses: withUnconscious(creature.statuses),
  };
  return {
    creature: updated,
    d20,
    title: "DEATH SAVE",
    detail: next.dead ? `${d20} · Dead` : `${d20} · Fail ${next.failures}/3`,
    outcome: "fail",
    log: next.dead
      ? `death save ${d20} — three failures, dead`
      : `death save ${d20} — fail ${next.failures}/3`,
  };
}
