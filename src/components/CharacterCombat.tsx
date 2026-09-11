import { Footprints, Skull, Swords, Target } from "lucide-react";
import { useMemo } from "react";
import { useRAM } from "../store";
import {
  ACTION_SLOTS,
  ACTION_SLOT_LABELS,
  activeCombatant,
  combatantById,
  movementBudget,
  rollDamageDice,
  weaponAttacks,
  type WeaponAttack,
} from "../combat";
import {
  creatureUsesDeathSaves,
  deathSaveState,
  isDying,
} from "../deathSaves";
import { d20FromResult, requestD20Roll } from "../diceRolls";
import { rollDie } from "../util";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  ABILITY_SHORT,
  formatMod,
  realHp,
  statusEffectColor,
  temporaryHp,
  type AbilityKey,
  type CalculatedCreatureStats,
  type PC,
} from "../types";
import { RamBadge, RamButton, RamSection } from "./ui/RamPrimitives";

function naturalSuffix(d20: number): string {
  return d20 === 20 ? " (natural 20)" : d20 === 1 ? " (natural 1)" : "";
}

function damageSummary(attack: WeaponAttack, dice: string): string {
  const bonus = attack.damageBonus === 0 ? "" : ` ${formatMod(attack.damageBonus)}`;
  const die = dice ? `${dice}${bonus}` : String(attack.damageBonus);
  return `${die}${attack.damageType ? ` ${attack.damageType}` : ""}`;
}

/**
 * Everything needed to actually take a turn: the live economy, attack lines
 * with derived to-hit numbers, defenses, and the full text of each action.
 * Editing still lives on the Play and Build tabs; this tab is for using the
 * character rather than changing it.
 */
export function CharacterCombat({
  pc,
  calculated,
}: {
  pc: PC;
  calculated: CalculatedCreatureStats;
}) {
  const rules = useRAM((state) => state.ruleDefinitions);
  const items = useRAM((state) => state.customLibraryItems);
  const combat = useRAM((state) => state.combat);
  const combatRules = useRAM((state) => state.gameplaySettings.combatRules);
  const addLog = useRAM((state) => state.addLog);
  const addTokenFloater = useRAM((state) => state.addTokenFloater);
  const nextTurn = useRAM((state) => state.nextTurn);
  const spendActionSlot = useRAM((state) => state.spendActionSlot);
  const toggleDash = useRAM((state) => state.toggleDash);
  const rollDeathSave = useRAM((state) => state.rollDeathSave);

  const attacks = useMemo(
    () => weaponAttacks(pc, rules, items),
    [pc, rules, items]
  );
  const combatant = combatantById(combat, pc.id);
  const isActive = activeCombatant(combat)?.id === pc.id;
  const budget = combatant
    ? movementBudget(combatant, Math.max(0, calculated.speed))
    : null;
  const saves = deathSaveState(pc);
  const dying = isDying(pc) && creatureUsesDeathSaves(pc);
  // The generic save DC keys off the best mental ability; a spell DC must use
  // the casting ability even when another one is higher.
  const castingAbility = calculated.spellcasting?.ability as AbilityKey | undefined;
  const castingMod = castingAbility
    ? calculated.abilityModifiers[castingAbility]
    : 0;

  function announce(title: string, text: string, outcome: "success" | "fail" | "info") {
    addLog({
      role: "system",
      author: "Attack",
      color: pc.color,
      authorId: pc.id,
      text: `${pc.name} — ${text}.`,
    });
    addTokenFloater({
      creatureId: pc.id,
      title: title.toUpperCase(),
      detail: text.split("= ")[1] ?? text,
      outcome,
    });
  }

  function rollAttack(attack: WeaponAttack) {
    requestD20Roll((result) => {
      const d20 = d20FromResult(result);
      const total = d20 + attack.toHit;
      announce(
        attack.name,
        `${attack.name} attack ${d20} ${formatMod(attack.toHit)} = ${total}${naturalSuffix(d20)}`,
        d20 === 20 ? "success" : d20 === 1 ? "fail" : "info"
      );
    });
  }

  function rollDamage(attack: WeaponAttack, dice: string) {
    const rolled = rollDamageDice(dice, rollDie);
    const total = Math.max(0, rolled + attack.damageBonus);
    const bonus = attack.damageBonus === 0 ? "" : ` ${formatMod(attack.damageBonus)}`;
    const detail = dice ? `${dice} ${rolled}${bonus} = ${total}` : String(total);
    announce(
      `${attack.name} damage`,
      `${attack.name} damage ${detail} ${attack.damageType}`.trimEnd(),
      "info"
    );
  }

  function rollSave(ability: AbilityKey) {
    const modifier = calculated.savingThrows[ability] ?? 0;
    requestD20Roll((result) => {
      const d20 = d20FromResult(result);
      const total = d20 + modifier;
      addLog({
        role: "system",
        author: "Save",
        color: pc.color,
        authorId: pc.id,
        text: `${pc.name} — ${ABILITY_SHORT[ability]} save ${d20} ${formatMod(
          modifier
        )} = ${total}${naturalSuffix(d20)}.`,
      });
      addTokenFloater({
        creatureId: pc.id,
        title: `${ABILITY_SHORT[ability]} SAVE`,
        detail: String(total),
        outcome: d20 === 20 ? "success" : d20 === 1 ? "fail" : "info",
      });
    });
  }

  return (
    <>
      {combat && (
        <RamSection
          title="This Turn"
          action={
            combatant ? (
              <RamBadge tone={isActive ? "brass" : "neutral"}>
                Initiative {combatant.initiative}
              </RamBadge>
            ) : (
              <RamBadge tone="neutral">Round {combat.round}</RamBadge>
            )
          }
        >
          {!combatant ? (
            <p className="sheet-empty-row">
              {pc.name} is not in the initiative order. Right-click the token on the
              map and choose Join combat.
            </p>
          ) : (
            <>
              <div className="combat-turn-state">
                <RamBadge tone={isActive ? "positive" : "neutral"}>
                  {isActive ? "Acting now" : "Waiting"}
                </RamBadge>
                <span>
                  Round {combat.round} · rolled {combatant.d20}{" "}
                  {formatMod(combatant.dexMod)}
                </span>
              </div>
              {combatRules === "off" ? (
                <p className="ram-field__hint">
                  Turn budgets are off. Change Combat rules in Settings to track
                  movement and actions.
                </p>
              ) : (
                <div className="combat-economy">
                  <button
                    type="button"
                    className={`turn-move${budget && budget.over > 0 ? " is-over" : ""}${
                      combatant.dashes > 0 ? " is-dashing" : ""
                    }`}
                    title={
                      combatant.dashes > 0
                        ? "Dashing. Click to cancel."
                        : "Click to Dash for double movement."
                    }
                    aria-pressed={combatant.dashes > 0}
                    onClick={() => toggleDash(pc.id)}
                  >
                    <Footprints size={14} strokeWidth={1.5} />
                    <span>
                      {budget?.used ?? 0} / {budget?.total ?? 0} ft
                    </span>
                  </button>
                  <div className="turn-slots">
                    {ACTION_SLOTS.map((slot) => (
                      <button
                        type="button"
                        key={slot}
                        className={`turn-slot${combatant[slot] ? " is-spent" : ""}`}
                        title={`${ACTION_SLOT_LABELS[slot]} — ${
                          combatant[slot] ? "spent" : "available"
                        }`}
                        aria-pressed={combatant[slot]}
                        onClick={() => spendActionSlot(pc.id, slot)}
                      >
                        {ACTION_SLOT_LABELS[slot]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {isActive && (
                <div className="combat-turn-actions">
                  <RamButton variant="primary" size="sm" onClick={() => nextTurn()}>
                    End turn
                  </RamButton>
                </div>
              )}
            </>
          )}
        </RamSection>
      )}

      <RamSection title="Attacks">
        {attacks.length === 0 ? (
          <p className="sheet-empty-row">No attacks available.</p>
        ) : (
          <div className="combat-attacks">
            {attacks.map((attack) => (
              <div className="combat-attack" key={attack.id}>
                <div className="combat-attack__head">
                  <strong>{attack.name}</strong>
                  <span className="combat-attack__meta">
                    {attack.range} · {ABILITY_SHORT[attack.ability]}
                    {!attack.proficient && " · not proficient"}
                  </span>
                </div>
                <div className="combat-attack__rolls">
                  <button
                    type="button"
                    className="combat-roll"
                    title={`Roll ${attack.name} attack`}
                    onClick={() => rollAttack(attack)}
                  >
                    <Target size={13} strokeWidth={1.5} />
                    {formatMod(attack.toHit)}
                  </button>
                  <button
                    type="button"
                    className="combat-roll"
                    title={`Roll ${attack.name} damage`}
                    onClick={() => rollDamage(attack, attack.damageDice)}
                  >
                    <Swords size={13} strokeWidth={1.5} />
                    {damageSummary(attack, attack.damageDice)}
                  </button>
                  {attack.versatileDice && (
                    <button
                      type="button"
                      className="combat-roll"
                      title={`Roll ${attack.name} damage two-handed`}
                      onClick={() => rollDamage(attack, attack.versatileDice!)}
                    >
                      <Swords size={13} strokeWidth={1.5} />
                      {damageSummary(attack, attack.versatileDice)} two-handed
                    </button>
                  )}
                </div>
                {attack.properties.length > 0 && (
                  <span className="available-action-list">
                    {attack.properties.map((property) => (
                      <span className="available-action-chip" key={property}>
                        {property}
                      </span>
                    ))}
                  </span>
                )}
                {attack.notes.map((note) => (
                  <p className="combat-attack__note" key={note}>
                    {note}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </RamSection>

      <RamSection title="Defenses">
        <div className="calculated-stat-grid calculated-stat-grid--compact">
          <span>
            <small>Armor Class</small>
            <strong>{calculated.armorClass}</strong>
          </span>
          <span>
            <small>Hit Points</small>
            <strong>
              {realHp(pc.hp, calculated.maxHp)} / {calculated.maxHp}
              {temporaryHp(pc.hp, calculated.maxHp) > 0 &&
                ` +${temporaryHp(pc.hp, calculated.maxHp)}`}
            </strong>
          </span>
          <span>
            <small>Speed</small>
            <strong>{calculated.speed || "—"} ft</strong>
          </span>
          <span>
            <small>Initiative</small>
            <strong>{formatMod(calculated.abilityModifiers.dex)}</strong>
          </span>
          <span>
            <small>Save DC</small>
            <strong>{calculated.saveDc}</strong>
          </span>
          <span>
            <small>Passive Perception</small>
            <strong>{calculated.passivePerception}</strong>
          </span>
        </div>
        <div className="combat-saves">
          {ABILITY_KEYS.map((ability) => (
            <button
              type="button"
              className="combat-save"
              key={ability}
              title={`Roll ${ABILITY_LABELS[ability]} saving throw`}
              onClick={() => rollSave(ability)}
            >
              <small>{ABILITY_SHORT[ability]}</small>
              <strong>{formatMod(calculated.savingThrows[ability] ?? 0)}</strong>
            </button>
          ))}
        </div>
        <div className="calculated-details">
          {(
            [
              ["Vulnerabilities", calculated.vulnerabilities],
              ["Resistances", calculated.resistances],
              ["Damage Immunities", calculated.damageImmunities],
              ["Condition Immunities", calculated.conditionImmunities],
              ["Senses", calculated.senses],
            ] as const
          )
            .filter(([, values]) => values.length > 0)
            .map(([label, values]) => (
              <span key={label}>
                <b>{label}</b>
                {values.join(", ")}
              </span>
            ))}
        </div>
      </RamSection>

      {calculated.spellcasting && (
        <RamSection title="Spellcasting">
          <div className="calculated-stat-grid calculated-stat-grid--compact">
            <span>
              <small>Ability</small>
              <strong>{ABILITY_SHORT[castingAbility!]}</strong>
            </span>
            <span>
              <small>Spell Save DC</small>
              <strong>{8 + calculated.proficiencyBonus + castingMod}</strong>
            </span>
            <span>
              <small>Spell Attack</small>
              <strong>
                {formatMod(calculated.proficiencyBonus + castingMod)}
              </strong>
            </span>
          </div>
          <div className="combat-slots">
            {calculated.spellcasting.slots.some((count) => count > 0) ? (
              calculated.spellcasting.slots.map((count, index) =>
                count > 0 ? (
                  <span className="combat-slot" key={index}>
                    <small>
                      {calculated.spellcasting?.mode === "pact"
                        ? `Pact ${calculated.spellcasting.slotLevels?.[pc.level - 1] ?? index + 1}`
                        : `Level ${index + 1}`}
                    </small>
                    <strong>{count}</strong>
                  </span>
                ) : null
              )
            ) : (
              <p className="sheet-empty-row">No spell slots at this level.</p>
            )}
          </div>
          <div className="calculated-details">
            <span>
              <b>Cantrips Known</b>
              {calculated.spellcasting.cantripsKnownAtLevel ?? "Prepared caster"}
            </span>
            <span>
              <b>Spells Known</b>
              {calculated.spellcasting.spellsKnownAtLevel ?? "Prepared caster"}
            </span>
          </div>
        </RamSection>
      )}

      <RamSection title="Conditions">
        {pc.statuses.length === 0 ? (
          <p className="sheet-empty-row">No active status effects.</p>
        ) : (
          <span className="available-action-list">
            {pc.statuses.map((status) => (
              <span
                className="available-action-chip"
                key={status.id}
                style={{ borderColor: statusEffectColor(status) }}
                title={status.note || undefined}
              >
                {status.name}
              </span>
            ))}
          </span>
        )}
        {(dying || saves.dead || saves.stable) && (
          <div className="combat-death">
            <span>
              <Skull size={14} strokeWidth={1.5} />
              {saves.dead
                ? "Dead"
                : saves.stable
                  ? "Stable"
                  : `Death saves ${saves.successes} ✓ / ${saves.failures} ✗`}
            </span>
            {dying && (
              <RamButton
                size="sm"
                onClick={() =>
                  requestD20Roll((result) =>
                    rollDeathSave(pc.id, true, d20FromResult(result))
                  )
                }
              >
                Roll death save
              </RamButton>
            )}
          </div>
        )}
      </RamSection>

      <ActionsSection calculated={calculated} pc={pc} />
    </>
  );
}

/**
 * The full text of every action the character can take. The Combat Stats block
 * on the Play tab lists these as bare names, which is enough to remember they
 * exist but not enough to resolve one mid-turn.
 */
function ActionsSection({
  calculated,
  pc,
}: {
  calculated: CalculatedCreatureStats;
  pc: PC;
}) {
  const standard = useMemo(() => {
    return calculated.specialActions
      .map((entry) => {
        const split = entry.indexOf(":");
        return split === -1
          ? { name: entry.trim(), description: "" }
          : {
              name: entry.slice(0, split).trim(),
              description: entry.slice(split + 1).trim(),
            };
      })
      // Weapon and unarmed lines are already shown as rollable attacks above.
      .filter(
        (action) =>
          !action.name.endsWith(" Attack") && action.name !== "Unarmed Strike"
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [calculated.specialActions]);

  return (
    <RamSection title="Actions">
      {standard.length === 0 ? (
        <p className="sheet-empty-row">No actions available.</p>
      ) : (
        <dl className="combat-actions">
          {standard.map((action) => (
            <div className="combat-action" key={action.name}>
              <dt>{action.name}</dt>
              <dd>{action.description || "—"}</dd>
            </div>
          ))}
        </dl>
      )}
      {pc.features.length > 0 && (
        <>
          <p className="ram-field__hint">
            Custom actions, editable on the Play tab.
          </p>
          <dl className="combat-actions">
            {pc.features.map((feature) => (
              <div className="combat-action" key={feature.id}>
                <dt>{feature.name || "Unnamed"}</dt>
                <dd>{feature.description || "—"}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </RamSection>
  );
}
