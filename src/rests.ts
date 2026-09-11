import { abilityMod, type CreatureMechanics, type PC, type RuleDefinition } from "./types";
import { applyHpChange, deathSaveState, healFully } from "./deathSaves";

export function classHitDie(pc: PC, rules: RuleDefinition[]): number {
  const cls = rules.find((rule) => rule.id === pc.classId);
  const die = cls?.hitDie ?? 0;
  return die > 0 ? die : 8;
}

export function applyFullRest<T extends CreatureMechanics>(creature: T): T {
  return healFully(creature).creature;
}

export function applyShortRest<T extends CreatureMechanics>(
  creature: T,
  hitDie: number
): T {
  const saves = deathSaveState(creature);
  if (saves.dead) return creature;
  const maxHp = Math.max(0, creature.maxHp);
  if (maxHp <= 0) return creature;
  if (creature.hp >= maxHp) return creature;
  const con = abilityMod(creature.abilities.con);
  const perDie = Math.max(1, Math.floor(hitDie / 2) + 1 + con);
  const dice = Math.max(1, creature.level);
  const nextHp = Math.min(maxHp, Math.max(0, creature.hp) + perDie * dice);
  return applyHpChange(creature, nextHp - creature.hp, { usesDeathSaves: true }).creature;
}
