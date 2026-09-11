import {
  ChevronLeft,
  ChevronRight,
  Footprints,
  Skull,
  Swords,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useRAM } from "../store";
import {
  ACTION_SLOTS,
  ACTION_SLOT_LABELS,
  activeCombatant,
  combatantSpeed,
  focusCreature,
  movementBudget,
} from "../combat";
import {
  deathConditionLabel,
  creatureUsesDeathSaves,
  isDead,
  isDying,
} from "../deathSaves";
import { d20FromResult, requestD20Roll } from "../diceRolls";
import {
  realHp,
  temporaryHp,
  tokenDisplayName,
  type Combatant,
  type MapToken,
  type PC,
} from "../types";
import { RamButton, RamConfirmDialog, RamIconButton } from "./ui/RamPrimitives";

interface TrackedCombatant {
  combatant: Combatant;
  creature: PC | MapToken;
  name: string;
  portrait: string | undefined;
  hpFraction: number;
  condition: string | null;
  dead: boolean;
}

export function TurnTracker() {
  const combat = useRAM((state) => state.combat);
  return combat ? <TurnTrackerStrip /> : null;
}

function TurnTrackerStrip() {
  const combat = useRAM((state) => state.combat)!;
  const pcs = useRAM((state) => state.pcs);
  const tokens = useRAM((state) => state.tokens);
  const rules = useRAM((state) => state.ruleDefinitions);
  const items = useRAM((state) => state.customLibraryItems);
  const combatRules = useRAM((state) => state.gameplaySettings.combatRules);
  const nextTurn = useRAM((state) => state.nextTurn);
  const prevTurn = useRAM((state) => state.prevTurn);
  const endCombat = useRAM((state) => state.endCombat);
  const selectPC = useRAM((state) => state.selectPC);
  const spendActionSlot = useRAM((state) => state.spendActionSlot);
  const toggleDash = useRAM((state) => state.toggleDash);
  const rollDeathSave = useRAM((state) => state.rollDeathSave);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const tracked = useMemo<TrackedCombatant[]>(() => {
    const list: TrackedCombatant[] = [];
    for (const combatant of combat.combatants) {
      const creature = combatant.isPC
        ? pcs.find((pc) => pc.id === combatant.id)
        : tokens.find((token) => token.id === combatant.id);
      if (!creature) continue;
      const maxHp = Math.max(1, creature.maxHp);
      list.push({
        combatant,
        creature,
        name: combatant.isPC
          ? creature.name
          : tokenDisplayName(creature as MapToken),
        portrait:
          ("portrait" in creature ? creature.portrait : undefined) ||
          creature.image,
        hpFraction: Math.min(
          1,
          (realHp(creature.hp, creature.maxHp) +
            temporaryHp(creature.hp, creature.maxHp)) /
            maxHp
        ),
        condition: deathConditionLabel(creature),
        dead: isDead(creature),
      });
    }
    return list;
  }, [combat.combatants, pcs, tokens]);

  const active = activeCombatant(combat);
  const activeEntry = tracked.find((entry) => entry.combatant.id === active?.id);
  const showEconomy = combatRules !== "off" && Boolean(activeEntry);
  const budget = activeEntry
    ? movementBudget(
        activeEntry.combatant,
        combatantSpeed(activeEntry.creature, rules, items)
      )
    : null;
  const activeIsDying = Boolean(
    activeEntry &&
      isDying(activeEntry.creature) &&
      creatureUsesDeathSaves(activeEntry.creature)
  );

  function focus(entry: TrackedCombatant) {
    if (entry.combatant.isPC) selectPC(entry.combatant.id);
    focusCreature(entry.combatant.id);
  }

  return (
    <>
      <section className="turn-tracker" aria-label="Turn order">
        <div className="turn-tracker__round">
          <Swords size={15} strokeWidth={1.5} />
          <strong>Round {combat.round}</strong>
          <small>
            {tracked.length} {tracked.length === 1 ? "combatant" : "combatants"}
          </small>
        </div>

        <ol className="turn-tracker__order">
          {tracked.map((entry) => {
            const isActive = entry.combatant.id === active?.id;
            return (
              <li key={entry.combatant.id}>
                <button
                  type="button"
                  className={`turn-chip${isActive ? " is-active" : ""}${
                    entry.dead ? " is-dead" : ""
                  }`}
                  aria-current={isActive ? "step" : undefined}
                  title={`${entry.name} — initiative ${entry.combatant.initiative}`}
                  onClick={() => focus(entry)}
                >
                  <span
                    className="turn-chip__portrait"
                    style={{ borderColor: entry.creature.color }}
                  >
                    {entry.portrait ? (
                      <img src={entry.portrait} alt="" />
                    ) : (
                      <i style={{ background: entry.creature.color }} />
                    )}
                    <b>{entry.combatant.initiative}</b>
                  </span>
                  <span className="turn-chip__name">{entry.name}</span>
                  <span className="turn-chip__hp" aria-hidden="true">
                    <i style={{ width: `${entry.hpFraction * 100}%` }} />
                  </span>
                  {entry.condition && (
                    <span className="turn-chip__condition">{entry.condition}</span>
                  )}
                </button>
              </li>
            );
          })}
        </ol>

        {showEconomy && budget && activeEntry && (
          <div className="turn-tracker__economy">
            <button
              type="button"
              className={`turn-move${budget.over > 0 ? " is-over" : ""}${
                activeEntry.combatant.dashes > 0 ? " is-dashing" : ""
              }`}
              title={
                activeEntry.combatant.dashes > 0
                  ? "Dashing. Click to cancel."
                  : "Click to Dash for double movement."
              }
              aria-pressed={activeEntry.combatant.dashes > 0}
              onClick={() => toggleDash(activeEntry.combatant.id)}
            >
              <Footprints size={14} strokeWidth={1.5} />
              <span>
                {budget.used} / {budget.total} ft
              </span>
            </button>
            <div className="turn-slots">
              {ACTION_SLOTS.map((slot) => (
                <button
                  type="button"
                  key={slot}
                  className={`turn-slot${
                    activeEntry.combatant[slot] ? " is-spent" : ""
                  }`}
                  title={`${ACTION_SLOT_LABELS[slot]} — ${
                    activeEntry.combatant[slot] ? "spent" : "available"
                  }`}
                  aria-pressed={activeEntry.combatant[slot]}
                  onClick={() => spendActionSlot(activeEntry.combatant.id, slot)}
                >
                  {ACTION_SLOT_LABELS[slot]}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="turn-tracker__actions">
          {activeIsDying && activeEntry && (
            <RamButton
              size="sm"
              variant="danger"
              icon={Skull}
              onClick={() =>
                requestD20Roll((result) =>
                  rollDeathSave(
                    activeEntry.combatant.id,
                    activeEntry.combatant.isPC,
                    d20FromResult(result)
                  )
                )
              }
            >
              Death save
            </RamButton>
          )}
          <RamIconButton label="Previous turn" onClick={prevTurn}>
            <ChevronLeft size={16} strokeWidth={1.5} />
          </RamIconButton>
          <RamButton size="sm" variant="primary" icon={ChevronRight} onClick={nextTurn}>
            End turn
          </RamButton>
          <RamIconButton
            label="End combat"
            variant="danger"
            onClick={() => setConfirmEnd(true)}
          >
            <X size={16} strokeWidth={1.5} />
          </RamIconButton>
        </div>
      </section>

      <RamConfirmDialog
        open={confirmEnd}
        title="End combat?"
        description={`The initiative order and turn budgets from ${combat.round} ${
          combat.round === 1 ? "round" : "rounds"
        } will be discarded.`}
        confirmLabel="End combat"
        onConfirm={endCombat}
        onClose={() => setConfirmEnd(false)}
      />
    </>
  );
}
