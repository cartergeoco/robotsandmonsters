import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRAM } from "../store";
import {
  ABILITY_POINT_BUY_BUDGET,
  ABILITY_SCORE_MAX,
  ABILITY_SCORE_MIN,
  ALIGNMENTS,
  CHALLENGE_RATINGS,
  CONDITION_TAGS,
  CREATURE_SIZES,
  CREATURE_TYPES,
  DAMAGE_TYPES,
  EQUIPMENT_SLOTS,
  LANGUAGE_TAGS,
  SENSE_TAGS,
  SIZE_PROFILES,
  SKILL_TAGS,
  abilityPointsSpent,
  activeCreatureRules,
  calculateCreatureStats,
  challengeXp,
  createStatBlock,
  formatHitDice,
  formatMod,
  inventoryFromKit,
  resolvedCreatureProfile,
  ruleChoiceCountAtLevel,
  statBlockHitPoints,
  type AbilityScores,
  type ChallengeRating,
  type CreatureMechanics,
  type EquipmentSlot,
  type Item,
  type LibraryItem,
  type RuleChoiceDefinition,
  type Skill,
  type StatBlockPatch,
  type Trait,
  type Wallet,
} from "../types";
import { itemRarityClassName, itemRarityStyle, rarityOfCarriedItem } from "./ItemName";
import {
  RamBadge,
  RamButton,
  RamField,
  RamIconButton,
  RamInput,
  RamSection,
  RamSelect,
} from "./ui/RamPrimitives";
import { TagInput } from "./ui/TagInput";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

const SPEED_MODES = [
  ["walk", "Walk"],
  ["burrow", "Burrow"],
  ["climb", "Climb"],
  ["fly", "Fly"],
  ["swim", "Swim"],
] as const;

const titleCase = (value: string) => value[0].toUpperCase() + value.slice(1);

function ListEditor({
  title,
  singular,
  values,
  onChange,
}: {
  title: string;
  singular: string;
  values: Trait[];
  onChange: (values: Trait[]) => void;
}) {
  return (
    <RamSection
      title={title}
      action={
        <RamIconButton
          label={`Add ${singular}`}
          onClick={() =>
            onChange([
              ...values,
              { id: crypto.randomUUID(), name: "", description: "" },
            ])
          }
        >
          <Plus size={15} />
        </RamIconButton>
      }
    >
      {values.length === 0 && (
        <p className="sheet-empty-row">No {title.toLowerCase()}.</p>
      )}
      <div className="ram-list-editor">
        {values.map((value) => (
          <div className="ram-list-row ram-list-row--description" key={value.id}>
            <RamInput
              className="title"
              value={value.name}
              placeholder={titleCase(singular)}
              onChange={(event) =>
                onChange(
                  values.map((entry) =>
                    entry.id === value.id ? { ...entry, name: event.target.value } : entry
                  )
                )
              }
            />
            <RamIconButton
              label={`Remove ${value.name || singular}`}
              variant="danger"
              onClick={() => onChange(values.filter((entry) => entry.id !== value.id))}
            >
              <Trash2 size={15} />
            </RamIconButton>
            <RamInput
              className="grow"
              value={value.description}
              placeholder="What it does"
              onChange={(event) =>
                onChange(
                  values.map((entry) =>
                    entry.id === value.id
                      ? { ...entry, description: event.target.value }
                      : entry
                  )
                )
              }
            />
          </div>
        ))}
      </div>
    </RamSection>
  );
}

function SkillsEditor({
  skills,
  printedTotals,
  onChange,
}: {
  skills: Skill[];
  /** Stat blocks print the final bonus; character sheets add to an ability modifier. */
  printedTotals: boolean;
  onChange: (skills: Skill[]) => void;
}) {
  return (
    <RamSection
      title={printedTotals ? "Skills" : "Skill Modifiers"}
      action={
        <RamIconButton
          label="Add skill"
          onClick={() =>
            onChange([...skills, { id: crypto.randomUUID(), name: "", bonus: 0 }])
          }
        >
          <Plus size={15} />
        </RamIconButton>
      }
    >
      {skills.length === 0 && (
        <p className="sheet-empty-row">
          {printedTotals ? "No listed skills." : "No manual skill modifiers."}
        </p>
      )}
      {printedTotals && skills.length > 0 && (
        <p className="ram-field__hint">
          Enter the total printed in the stat block, not a bonus added to an ability
          modifier.
        </p>
      )}
      <div className="ram-list-editor">
        {skills.map((skill) => (
          <div className="ram-list-row" key={skill.id}>
            <RamInput
              className="grow"
              value={skill.name}
              placeholder="Skill"
              list={printedTotals ? "creature-skill-tags" : undefined}
              onChange={(event) =>
                onChange(
                  skills.map((entry) =>
                    entry.id === skill.id ? { ...entry, name: event.target.value } : entry
                  )
                )
              }
            />
            <RamInput
              className="numeric"
              type="number"
              value={skill.bonus}
              aria-label={`${skill.name || "Skill"} modifier`}
              onChange={(event) =>
                onChange(
                  skills.map((entry) =>
                    entry.id === skill.id
                      ? { ...entry, bonus: Number(event.target.value) || 0 }
                      : entry
                  )
                )
              }
            />
            <RamIconButton
              label={`Remove ${skill.name || "skill"}`}
              variant="danger"
              onClick={() => onChange(skills.filter((entry) => entry.id !== skill.id))}
            >
              <Trash2 size={15} />
            </RamIconButton>
          </div>
        ))}
      </div>
      {printedTotals && (
        <datalist id="creature-skill-tags">
          {SKILL_TAGS.map((skill) => (
            <option value={skill} key={skill} />
          ))}
        </datalist>
      )}
    </RamSection>
  );
}

function CalculatedStats({
  calculated,
  hp,
  onHpChange,
  hideHp = false,
}: {
  calculated: ReturnType<typeof calculateCreatureStats>;
  hp: number;
  onHpChange: (hp: number) => void;
  hideHp?: boolean;
}) {
  return (
    <RamSection title="Combat Stats">
      <div className={`calculated-stat-grid${hideHp ? " calculated-stat-grid--compact" : ""}`}>
        <span><small>Max HP</small><strong>{calculated.maxHp}</strong></span>
        <span><small>Armor Class</small><strong>{calculated.armorClass}</strong></span>
        <span><small>Proficiency</small><strong>{formatMod(calculated.proficiencyBonus)}</strong></span>
        <span><small>Save DC</small><strong>{calculated.saveDc}</strong></span>
        <span><small>Speed</small><strong>{calculated.speed || "—"}</strong></span>
        <span><small>Passive Perception</small><strong>{calculated.passivePerception}</strong></span>
        {!hideHp && (
          <span>
            <small>Current HP</small>
            <RamInput
              type="number"
              min={0}
              value={hp}
              onChange={(event) => onHpChange(Math.max(0, Number(event.target.value) || 0))}
            />
          </span>
        )}
      </div>
      <div className="calculated-details">
        <span><b>Proficiencies</b>{calculated.proficiencies.join(", ") || "None"}</span>
        <span><b>Senses</b>{calculated.senses.join(", ") || "Standard"}</span>
        <span><b>Languages</b>{calculated.languages.join(", ") || "None"}</span>
        <span><b>Vulnerabilities</b>{calculated.vulnerabilities.join(", ") || "None"}</span>
        <span><b>Resistances</b>{calculated.resistances.join(", ") || "None"}</span>
        <span><b>Damage Immunities</b>{calculated.damageImmunities.join(", ") || "None"}</span>
        <span><b>Condition Immunities</b>{calculated.conditionImmunities.join(", ") || "None"}</span>
        <span><b>Skill Bonuses</b>{calculated.skillBonuses.join(", ") || "None"}</span>
        <span className="span-all">
          <b>Available Actions</b>
          <span className="available-action-list">
            {calculated.specialActions.length
              ? calculated.specialActions
                  .map((action) => action.split(":")[0].trim())
                  .sort((a, b) => a.localeCompare(b))
                  .map((action, index) => (
                    <span className="available-action-chip" key={`${action}-${index}`}>
                      {action}
                    </span>
                  ))
              : "None"}
          </span>
        </span>
      </div>
    </RamSection>
  );
}

function AbilityImprovementsEditor({
  value,
  calculated,
  onChange,
}: {
  value: CreatureMechanics;
  calculated: ReturnType<typeof calculateCreatureStats>;
  onChange: (patch: Partial<CreatureMechanics>) => void;
}) {
  const improvements = value.abilityImprovements ?? [];

  function picksAtLevel(level: number): Array<keyof AbilityScores> {
    const improvement = improvements.find((entry) => entry.level === level);
    if (!improvement) return [];
    return ABILITIES.flatMap((ability) =>
      Array.from(
        { length: Math.max(0, Math.min(2, improvement.increases[ability] ?? 0)) },
        () => ability
      )
    ).slice(0, 2);
  }

  function setPick(level: number, index: number, ability: string) {
    const picks = picksAtLevel(level);
    while (picks.length <= index) picks.push("" as keyof AbilityScores);
    picks[index] = ability as keyof AbilityScores;
    const selected = picks.filter(
      (entry): entry is keyof AbilityScores => ABILITIES.includes(entry)
    );
    const increases = selected.reduce<Partial<AbilityScores>>(
      (next, entry) => ({ ...next, [entry]: (next[entry] ?? 0) + 1 }),
      {}
    );
    const next = improvements.filter((entry) => entry.level !== level);
    if (selected.length > 0) next.push({ level, increases });
    onChange({ abilityImprovements: next.sort((a, b) => a.level - b.level) });
  }

  return (
    <RamSection
      title="Ability Score Improvements"
      action={
        <RamBadge
          tone={
            calculated.abilityImprovementsSpent < calculated.abilityImprovementsEarned
              ? "danger"
              : "brass"
          }
        >
          {calculated.abilityImprovementsSpent} / {calculated.abilityImprovementsEarned} spent
        </RamBadge>
      }
    >
      {calculated.abilityImprovementLevels.length === 0 ? (
        <p className="sheet-empty-row">No ability score improvement earned yet.</p>
      ) : (
        <div className="ram-list-editor">
          {calculated.abilityImprovementLevels.map((level) => {
            const picks = picksAtLevel(level);
            return (
              <div className="rule-choice-card" key={level}>
                <span className="ram-field__label">Level {level}</span>
                <span className="ram-field__hint">
                  Choose one ability twice for +2, or two abilities once for +1 each.
                </span>
                <div className="ram-field-grid ram-field-grid--2">
                  {[0, 1].map((index) => (
                    <RamField label={`Increase ${index + 1}`} key={index}>
                      <RamSelect
                        value={picks[index] ?? ""}
                        onChange={(event) => setPick(level, index, event.target.value)}
                      >
                        <option value="">Unspent</option>
                        {ABILITIES.map((ability) => (
                          <option
                            value={ability}
                            key={ability}
                            disabled={
                              calculated.abilityScores[ability] >= 20 &&
                              picks[index] !== ability
                            }
                          >
                            {ability.toUpperCase()} ({calculated.abilityScores[ability]})
                          </option>
                        ))}
                      </RamSelect>
                    </RamField>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </RamSection>
  );
}

function ProgressionReference({
  calculated,
  level,
}: {
  calculated: ReturnType<typeof calculateCreatureStats>;
  level: number;
}) {
  if (!calculated.spellcasting && calculated.resources.length === 0) return null;
  const slots = calculated.spellcasting?.slots ?? [];
  const pactSlotLevel =
    calculated.spellcasting?.mode === "pact"
      ? calculated.spellcasting.slotLevels?.[Math.max(0, level - 1)]
      : undefined;
  return (
    <RamSection title="Progression Reference">
      <p className="ram-field__hint">
        Recorded values for future spell and combat automation; they are not spendable yet.
      </p>
      <div className="calculated-details">
        {calculated.spellcasting && (
          <>
            <span>
              <b>Spellcasting</b>
              {calculated.spellcasting.ability.toUpperCase()} · {calculated.spellcasting.mode}
            </span>
            <span>
              <b>Spell Slots</b>
              {slots.length
                ? calculated.spellcasting.mode === "pact"
                  ? `${slots[0] ?? 0} at level ${pactSlotLevel ?? "—"}`
                  : slots.map((count, index) => `${index + 1}st: ${count}`).join(", ")
                : "None"}
            </span>
            <span>
              <b>Cantrips Known</b>
              {calculated.spellcasting.cantripsKnownAtLevel ?? "Prepared caster"}
            </span>
            <span>
              <b>Spells Known</b>
              {calculated.spellcasting.spellsKnownAtLevel ?? "Prepared caster"}
            </span>
          </>
        )}
        {calculated.resources.map((resource) => (
          <span key={resource.id}>
            <b>{resource.name}</b>
            {resource.value} {resource.unit}
          </span>
        ))}
      </div>
    </RamSection>
  );
}

function WalletEditor({
  wallet,
  onChange,
}: {
  wallet: Wallet;
  onChange: (wallet: Wallet) => void;
}) {
  return (
    <RamSection title="Wallet">
      <div className="ram-field-grid ram-field-grid--3">
        {(["gold", "silver", "copper"] as const).map((coin) => (
          <RamField label={titleCase(coin)} key={coin}>
            <RamInput
              type="number"
              min={0}
              value={wallet[coin]}
              onChange={(event) =>
                onChange({
                  ...wallet,
                  [coin]: Math.max(0, Number(event.target.value) || 0),
                })
              }
            />
          </RamField>
        ))}
      </div>
    </RamSection>
  );
}

function EquipmentEditor({
  inventory,
  libraryItems,
  onChange,
}: {
  inventory: Item[];
  libraryItems: LibraryItem[];
  onChange: (inventory: Item[]) => void;
}) {
  const sortedInventory = [...inventory].sort((a, b) => a.name.localeCompare(b.name));
  const itemCatalog = (item: Item) =>
    libraryItems.find((entry) => entry.id === item.libraryItemId);
  const mainHand = inventory.find((item) => item.equippedSlot === "mainHand");
  const mainCatalog = mainHand ? itemCatalog(mainHand) : undefined;
  const mainIsTwoHanded = Boolean(
    mainCatalog?.properties.some((property) => property.toLowerCase() === "two-handed")
  );

  function allowed(item: Item, slot: EquipmentSlot): boolean {
    const catalog = itemCatalog(item);
    if (!catalog) return false;
    if (slot === "armor") {
      return catalog.category === "armor" && catalog.equipSlot !== "shield";
    }
    if (slot === "mainHand" || slot === "offHand") {
      return (
        (catalog.category === "weapon" || catalog.equipSlot === "shield") &&
        !(
          slot === "offHand" &&
          catalog.properties.some(
            (property) => property.toLowerCase() === "two-handed"
          )
        )
      );
    }
    return catalog.category === "gear" && catalog.equipSlot === "gear";
  }

  function equip(slot: EquipmentSlot, itemId: string) {
    const selected = inventory.find((item) => item.id === itemId);
    if (selected && !allowed(selected, slot)) return;
    const selectedCatalog = selected ? itemCatalog(selected) : undefined;
    const selectedIsTwoHanded = Boolean(
      selectedCatalog?.properties.some(
        (property) => property.toLowerCase() === "two-handed"
      )
    );
    const next = inventory.map((item) => {
      if (item.id === itemId) return { ...item, equippedSlot: slot, equipped: true };
      if (item.equippedSlot === slot) {
        return { ...item, equippedSlot: undefined, equipped: false };
      }
      if (slot === "mainHand" && selectedIsTwoHanded && item.equippedSlot === "offHand") {
        return { ...item, equippedSlot: undefined, equipped: false };
      }
      return item;
    });
    onChange(next);
  }

  const labels: Record<EquipmentSlot, string> = {
    armor: "Armor",
    mainHand: "Main Hand",
    offHand: "Off Hand",
    gear1: "Gear 1",
    gear2: "Gear 2",
    gear3: "Gear 3",
  };

  return (
    <RamSection title="Equipment">
      <div className="equipment-slot-grid">
        {EQUIPMENT_SLOTS.map((slot) => {
          const equipped = inventory.find((item) => item.equippedSlot === slot);
          const disabled = slot === "offHand" && mainIsTwoHanded;
          return (
            <RamField
              label={labels[slot]}
              key={slot}
              hint={disabled ? "Disabled by a two-handed main weapon" : undefined}
            >
              <RamSelect
                className={itemRarityClassName(
                  equipped ? rarityOfCarriedItem(equipped, libraryItems) : "common"
                )}
                value={equipped?.id ?? ""}
                disabled={disabled}
                onChange={(event) => equip(slot, event.target.value)}
              >
                <option value="">Empty</option>
                {sortedInventory.filter((item) => allowed(item, slot)).map((item) => (
                  <option
                    value={item.id}
                    key={item.id}
                    style={itemRarityStyle(rarityOfCarriedItem(item, libraryItems))}
                  >
                    {item.name}
                  </option>
                ))}
              </RamSelect>
            </RamField>
          );
        })}
      </div>
    </RamSection>
  );
}

function InventoryEditor({
  inventory,
  onChange,
}: {
  inventory: Item[];
  onChange: (items: Item[]) => void;
}) {
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const sortedLibraryItems = useMemo(
    () => [...libraryItems].sort((a, b) => a.name.localeCompare(b.name)),
    [libraryItems]
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const availableId = selectedItemId || sortedLibraryItems[0]?.id || "";
  const selectedLibraryItem = libraryItems.find((item) => item.id === availableId);
  const ordered = [...inventory].sort(
    (a, b) =>
      Number(Boolean(b.equippedSlot)) - Number(Boolean(a.equippedSlot)) ||
      a.name.localeCompare(b.name)
  );

  function addItem() {
    const source = libraryItems.find((item) => item.id === availableId);
    if (!source) return;
    onChange([
      ...inventory,
      {
        id: crypto.randomUUID(),
        libraryItemId: source.id,
        name: source.name,
        qty: 1,
        notes: "",
        equipped: false,
      },
    ]);
  }

  return (
    <RamSection title="Inventory">
      <div className="inventory-add-row">
        <RamSelect
          className={itemRarityClassName(selectedLibraryItem?.rarity)}
          value={availableId}
          disabled={libraryItems.length === 0}
          aria-label="Add from library"
          onChange={(event) => setSelectedItemId(event.target.value)}
        >
          {libraryItems.length === 0 && <option value="">No library items</option>}
          {sortedLibraryItems.map((item) => (
            <option
              value={item.id}
              key={item.id}
              style={itemRarityStyle(item.rarity)}
            >
              {item.name} — {item.category}
            </option>
          ))}
        </RamSelect>
        <RamIconButton label="Add selected item" onClick={addItem} disabled={!availableId}>
          <Plus size={15} />
        </RamIconButton>
      </div>
      {ordered.length === 0 && <p className="sheet-empty-row">No carried items.</p>}
      <div className="ram-list-editor inventory-list">
        {ordered.map((item) => (
          <div
            className={`ram-list-row creature-inventory-row${
              item.equippedSlot ? " is-equipped" : ""
            }`}
            key={item.id}
          >
            {item.equippedSlot && <RamBadge tone="brass">E</RamBadge>}
            <RamInput
              className={`grow ${itemRarityClassName(rarityOfCarriedItem(item, libraryItems))}`}
              value={item.name}
              aria-label="Item name"
              onChange={(event) =>
                onChange(
                  inventory.map((entry) =>
                    entry.id === item.id ? { ...entry, name: event.target.value } : entry
                  )
                )
              }
            />
            <RamInput
              className="numeric"
              type="number"
              min={0}
              value={item.qty}
              aria-label={`${item.name} quantity`}
              onChange={(event) =>
                onChange(
                  inventory.map((entry) =>
                    entry.id === item.id
                      ? { ...entry, qty: Math.max(0, Number(event.target.value)) }
                      : entry
                  )
                )
              }
            />
            <RamIconButton
              label={`Remove ${item.name}`}
              variant="danger"
              onClick={() => onChange(inventory.filter((entry) => entry.id !== item.id))}
            >
              <Trash2 size={15} />
            </RamIconButton>
          </div>
        ))}
      </div>
    </RamSection>
  );
}

function displayChoiceOption(
  option: string,
  target: RuleChoiceDefinition["target"]
) {
  return target === "ability" ? option.toUpperCase() : option;
}

function RuleChoiceCard({
  choice,
  values,
  level,
  onChange,
}: {
  choice: RuleChoiceDefinition;
  values: string[];
  level: number;
  onChange: (values: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const count = ruleChoiceCountAtLevel(choice, level);
  const complete = values.length >= count;
  const options = choice.options;
  const extras = values.filter(
    (value) =>
      !options.some((option) => option.toLowerCase() === value.toLowerCase())
  );

  function toggle(option: string) {
    if (values.some((value) => value.toLowerCase() === option.toLowerCase())) {
      onChange(
        values.filter((value) => value.toLowerCase() !== option.toLowerCase())
      );
      return;
    }
    if (complete) return;
    onChange([...values, option]);
  }

  function addCustom() {
    const trimmed = draft.trim();
    if (!trimmed || complete) return;
    if (values.some((value) => value.toLowerCase() === trimmed.toLowerCase())) {
      setDraft("");
      return;
    }
    const known = options.find(
      (option) => option.toLowerCase() === trimmed.toLowerCase()
    );
    onChange([...values, known ?? trimmed]);
    setDraft("");
  }

  const selectedOnly = options.length === 0 ? values : extras;

  return (
    <div className="pc-choice-card">
      <div className="pc-choice-card__header">
        <div className="pc-choice-card__copy">
          <strong>{choice.label}</strong>
          {(choice.level ?? 1) > 1 && (
            <span className="pc-choice-card__level">Level {choice.level}</span>
          )}
        </div>
        <RamBadge tone={complete ? "brass" : "danger"}>
          {values.length} / {count}
        </RamBadge>
      </div>
      {(options.length > 0 || selectedOnly.length > 0) && (
        <div className="pc-choice-options">
          {options.map((option) => {
            const selected = values.some(
              (value) => value.toLowerCase() === option.toLowerCase()
            );
            return (
              <button
                type="button"
                key={option}
                className={`pc-choice-option${selected ? " is-selected" : ""}`}
                aria-pressed={selected}
                disabled={!selected && complete}
                onClick={() => toggle(option)}
              >
                {displayChoiceOption(option, choice.target)}
              </button>
            );
          })}
          {selectedOnly.map((option) => (
            <button
              type="button"
              key={option}
              className="pc-choice-option is-selected"
              aria-pressed
              onClick={() => toggle(option)}
            >
              {displayChoiceOption(option, choice.target)}
            </button>
          ))}
        </div>
      )}
      {choice.allowCustom && !complete && (
        <RamInput
          value={draft}
          placeholder="Add another…"
          aria-label={`Add ${choice.label}`}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addCustom();
            }
          }}
        />
      )}
    </div>
  );
}

/**
 * Objects are not creatures: the Dungeon Master's Guide gives them a size, an
 * armor class drawn from their material, and hit points drawn from how big and
 * how fragile they are. Everything else on a stat block would be noise here.
 */
export function ObjectStatEditor({
  value,
  onChange,
}: {
  value: CreatureMechanics;
  onChange: (patch: Partial<CreatureMechanics>) => void;
}) {
  const statBlock = value.statBlock;
  if (!statBlock) return null;

  const patchStatBlock = (patch: StatBlockPatch) =>
    onChange({
      statBlock: {
        ...statBlock,
        ...patch,
        speeds: { ...statBlock.speeds, ...patch.speeds },
      },
    });

  return (
    <RamSection title="Object">
      <div className="ram-field-grid ram-field-grid--2">
        <RamField label="Size">
          <RamSelect
            value={value.size}
            onChange={(event) =>
              onChange({ size: event.target.value as CreatureMechanics["size"] })
            }
          >
            {CREATURE_SIZES.map((size) => (
              <option value={size} key={size}>
                {titleCase(size)}
              </option>
            ))}
          </RamSelect>
        </RamField>
        <RamField label="Material" hint="Cloth, glass, wood, stone, iron…">
          <RamInput
            value={statBlock.armorNote}
            placeholder="wood"
            onChange={(event) => patchStatBlock({ armorNote: event.target.value })}
          />
        </RamField>
        <RamField label="Armor Class">
          <RamInput
            type="number"
            min={0}
            value={value.ac}
            onChange={(event) =>
              onChange({ ac: Math.max(0, Number(event.target.value) || 0) })
            }
          />
        </RamField>
        <RamField label="Hit Points" hint="0 makes the object indestructible.">
          <RamInput
            type="number"
            min={0}
            value={value.maxHp}
            onChange={(event) => {
              const maxHp = Math.max(0, Number(event.target.value) || 0);
              onChange({ maxHp });
            }}
          />
        </RamField>
        <RamField label="Current Hit Points">
          <RamInput
            type="number"
            min={0}
            value={value.hp}
            onChange={(event) =>
              onChange({
                hp: Math.max(0, Number(event.target.value) || 0),
              })
            }
          />
        </RamField>
      </div>
      <div className="rule-choice-list statblock-speed-grid">
        <RamField label="Damage Vulnerabilities">
          <TagInput
            values={statBlock.vulnerabilities}
            suggestions={DAMAGE_TYPES}
            ariaLabel="Damage vulnerabilities"
            onChange={(vulnerabilities) => patchStatBlock({ vulnerabilities })}
          />
        </RamField>
        <RamField label="Damage Resistances">
          <TagInput
            values={statBlock.resistances}
            suggestions={DAMAGE_TYPES}
            ariaLabel="Damage resistances"
            onChange={(resistances) => patchStatBlock({ resistances })}
          />
        </RamField>
        <RamField label="Damage Immunities" className="span-all">
          <TagInput
            values={statBlock.damageImmunities}
            suggestions={DAMAGE_TYPES}
            ariaLabel="Damage immunities"
            onChange={(damageImmunities) => patchStatBlock({ damageImmunities })}
          />
        </RamField>
      </div>
    </RamSection>
  );
}

export function CreatureMechanicsEditor({
  value,
  onChange,
  pcMode = false,
  include = "all",
}: {
  value: CreatureMechanics;
  onChange: (patch: Partial<CreatureMechanics>) => void;
  pcMode?: boolean;
  include?: "all" | "build" | "play";
}) {
  const rules = useRAM((state) => state.ruleDefinitions);
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const byName = <T extends { name: string },>(a: T, b: T) =>
    a.name.localeCompare(b.name);
  const races = rules.filter((rule) => rule.kind === "race").sort(byName);
  const classes = rules.filter((rule) => rule.kind === "class").sort(byName);
  const backgrounds = rules.filter((rule) => rule.kind === "background").sort(byName);
  const subraces = rules.filter(
    (rule) => rule.kind === "subrace" && rule.parentId === value.raceId
  ).sort(byName);
  const subclasses = rules.filter(
    (rule) => rule.kind === "subclass" && rule.parentId === value.classId
  ).sort(byName);
  const activeRules = activeCreatureRules(value, rules);
  const availableChoices = activeRules.flatMap((rule) =>
    (rule.choices ?? [])
      .filter((choice) => (choice.level ?? 1) <= value.level)
      .map((choice) => ({ rule, choice }))
  );
  const calculated = useMemo(
    () => calculateCreatureStats(value, rules, libraryItems),
    [value, rules, libraryItems]
  );
  const profile = resolvedCreatureProfile(value, rules);
  const pointsSpent = abilityPointsSpent(value.abilities);
  const pointsRemaining = ABILITY_POINT_BUY_BUDGET - pointsSpent;
  const statBlock = value.statBlock;

  function patchStatBlock(patch: StatBlockPatch) {
    if (!statBlock) return;
    onChange({
      statBlock: {
        ...statBlock,
        ...patch,
        speeds: { ...statBlock.speeds, ...patch.speeds },
      },
    });
  }

  /**
   * A creature is described either by a stat block or by the character rules,
   * never by both. Adopting a stat block drops the race, class, background, and
   * level, because a monster's type "has no rules of its own".
   */
  function setStatBlockBasis(useStatBlock: boolean) {
    if (!useStatBlock) {
      onChange({ statBlock: null });
      return;
    }
    const inanimate = value.creatureType === "object";
    onChange({
      raceId: "",
      race: "",
      subraceId: "",
      subrace: "",
      classId: "",
      className: "",
      subclassId: "",
      subclass: "",
      backgroundId: "",
      backgroundName: "",
      ruleChoices: {},
      abilityImprovements: [],
      level: 1,
      statBlock: createStatBlock({
        alignment: inanimate ? "Unaligned" : "True Neutral",
        // Zero hit dice keeps the hit points already recorded on this creature.
        hitDice: 0,
        speeds: { walk: inanimate ? 0 : 30 },
      }),
    });
  }

  // Character-built creatures always show a race and a class, so the selects
  // never display an entry the creature has not actually taken.
  useEffect(() => {
    if (statBlock) return;
    const patch: Partial<CreatureMechanics> = {};
    if (!value.raceId && races[0]) {
      patch.raceId = races[0].id;
      patch.race = races[0].name;
    }
    if (!value.classId && classes[0]) {
      patch.classId = classes[0].id;
      patch.className = classes[0].name;
    }
    if (Object.keys(patch).length) onChange(patch);
  }, [classes, onChange, races, statBlock, value.classId, value.raceId]);

  function selectRule(
    idField: "raceId" | "subraceId" | "classId" | "subclassId" | "backgroundId",
    nameField: "race" | "subrace" | "className" | "subclass" | "backgroundName",
    id: string
  ) {
    const selected = rules.find((rule) => rule.id === id);
    const patch: Partial<CreatureMechanics> = {
      [idField]: id,
      [nameField]: selected?.name ?? "",
    };
    if (idField === "raceId") {
      patch.subraceId = "";
      patch.subrace = "";
    }
    if (idField === "classId") {
      patch.subclassId = "";
      patch.subclass = "";
      if (value.inventory.length === 0 && selected?.startingKit.length) {
        patch.inventory = inventoryFromKit(selected.startingKit, libraryItems);
      }
    }
    const nextProfile = resolvedCreatureProfile({ ...value, ...patch }, rules);
    patch.size = nextProfile.size;
    patch.creatureType = nextProfile.creatureType;
    onChange(patch);
  }

  function setAbility(ability: keyof AbilityScores, score: number) {
    const clamped = Math.max(ABILITY_SCORE_MIN, Math.min(ABILITY_SCORE_MAX, score));
    const next = { ...value.abilities, [ability]: clamped };
    if (abilityPointsSpent(next) <= ABILITY_POINT_BUY_BUDGET) {
      onChange({ abilities: next });
    }
  }

  const showBuild = include === "all" || include === "build";
  const showPlay = include === "all" || include === "play";
  const choiceGroups = availableChoices.reduce<
    Array<{
      rule: (typeof availableChoices)[number]["rule"];
      items: typeof availableChoices;
    }>
  >((groups, item) => {
    const last = groups[groups.length - 1];
    if (last && last.rule.id === item.rule.id) last.items.push(item);
    else groups.push({ rule: item.rule, items: [item] });
    return groups;
  }, []);
  const choiceProgress = availableChoices.reduce(
    (sum, { rule, choice }) => {
      const need = ruleChoiceCountAtLevel(choice, value.level);
      const have = (value.ruleChoices?.[`${rule.id}:${choice.id}`] ?? []).length;
      return {
        have: sum.have + Math.min(have, need),
        need: sum.need + need,
      };
    },
    { have: 0, need: 0 }
  );

  const basisToggle = pcMode ? undefined : (
    <div className="creature-basis-toggle">
      <RamButton
        size="sm"
        variant={statBlock ? "primary" : "ghost"}
        aria-pressed={Boolean(statBlock)}
        onClick={() => setStatBlockBasis(true)}
      >
        Stat Block
      </RamButton>
      <RamButton
        size="sm"
        variant={statBlock ? "ghost" : "primary"}
        aria-pressed={!statBlock}
        onClick={() => setStatBlockBasis(false)}
      >
        Race &amp; Class
      </RamButton>
    </div>
  );

  if (statBlock) {
    return (
      <div className="creature-mechanics-editor">
        <RamSection title="Creature" action={basisToggle}>
          <p className="ram-field__hint">
            A stat block creature is described by its type, size, and printed numbers.
            It has no race, class, background, or level.
          </p>
          <div className="ram-field-grid ram-field-grid--2">
            <RamField label="Creature Type">
              <RamSelect
                value={value.creatureType}
                onChange={(event) =>
                  onChange({
                    creatureType: event.target.value as CreatureMechanics["creatureType"],
                  })
                }
              >
                {CREATURE_TYPES.map((type) => (
                  <option value={type} key={type}>
                    {titleCase(type)}
                  </option>
                ))}
              </RamSelect>
            </RamField>
            <RamField label="Size" hint={`Hit die d${SIZE_PROFILES[value.size].hitDie}`}>
              <RamSelect
                value={value.size}
                onChange={(event) =>
                  onChange({ size: event.target.value as CreatureMechanics["size"] })
                }
              >
                {CREATURE_SIZES.map((size) => (
                  <option value={size} key={size}>
                    {titleCase(size)}
                  </option>
                ))}
              </RamSelect>
            </RamField>
            <RamField label="Alignment">
              <RamSelect
                value={statBlock.alignment}
                onChange={(event) => patchStatBlock({ alignment: event.target.value })}
              >
                {ALIGNMENTS.map((alignment) => (
                  <option value={alignment} key={alignment}>
                    {alignment}
                  </option>
                ))}
                {!ALIGNMENTS.includes(
                  statBlock.alignment as (typeof ALIGNMENTS)[number]
                ) && <option value={statBlock.alignment}>{statBlock.alignment}</option>}
              </RamSelect>
            </RamField>
            <RamField
              label="Challenge"
              hint={`${challengeXp(statBlock.challenge).toLocaleString()} XP · proficiency ${formatMod(
                calculated.proficiencyBonus
              )}`}
            >
              <RamSelect
                value={statBlock.challenge}
                onChange={(event) =>
                  patchStatBlock({ challenge: event.target.value as ChallengeRating })
                }
              >
                {CHALLENGE_RATINGS.map((challenge) => (
                  <option value={challenge} key={challenge}>
                    {challenge}
                  </option>
                ))}
              </RamSelect>
            </RamField>
            <RamField
              label="Type Tags"
              className="span-all"
              hint="Parenthetical tags after the type, such as goblinoid or shapechanger."
            >
              <TagInput
                values={statBlock.tags}
                suggestions={[]}
                ariaLabel="Type tags"
                placeholder="Add tag…"
                onChange={(tags) => patchStatBlock({ tags })}
              />
            </RamField>
          </div>
        </RamSection>

        <RamSection title="Stat Block">
          <div className="ram-field-grid ram-field-grid--2">
            <RamField label="Armor Class">
              <RamInput
                type="number"
                min={0}
                value={value.ac}
                onChange={(event) =>
                  onChange({ ac: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </RamField>
            <RamField label="Armor Note" hint="Natural armor, chain shirt, shield…">
              <RamInput
                value={statBlock.armorNote}
                placeholder="natural armor"
                onChange={(event) => patchStatBlock({ armorNote: event.target.value })}
              />
            </RamField>
            <RamField
              label="Hit Dice"
              hint={
                statBlock.hitDice > 0
                  ? `${formatHitDice(statBlock, value.size, value.abilities.con)} = ${statBlockHitPoints(
                      statBlock,
                      value.size,
                      value.abilities.con
                    )} HP`
                  : "Leave at 0 to set hit points directly."
              }
            >
              <RamInput
                type="number"
                min={0}
                value={statBlock.hitDice}
                onChange={(event) =>
                  patchStatBlock({ hitDice: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </RamField>
            <RamField
              label="Max HP"
              hint={statBlock.hitDice > 0 ? "Rolled from the Hit Dice above." : undefined}
            >
              <RamInput
                type="number"
                min={0}
                disabled={statBlock.hitDice > 0}
                value={calculated.maxHp}
                onChange={(event) =>
                  onChange({ maxHp: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </RamField>
          </div>
          <div className="ram-field-grid ram-field-grid--3 statblock-speed-grid">
            {SPEED_MODES.map(([mode, label]) => (
              <RamField label={`${label} (ft.)`} key={mode}>
                <RamInput
                  type="number"
                  min={0}
                  step={5}
                  value={statBlock.speeds[mode]}
                  onChange={(event) =>
                    patchStatBlock({
                      speeds: { [mode]: Math.max(0, Number(event.target.value) || 0) },
                    })
                  }
                />
              </RamField>
            ))}
            <label className="equip-toggle statblock-hover">
              <input
                type="checkbox"
                checked={statBlock.speeds.hover}
                disabled={statBlock.speeds.fly === 0}
                onChange={(event) =>
                  patchStatBlock({ speeds: { hover: event.target.checked } })
                }
              />
              <span>Hover</span>
            </label>
          </div>
          <div className="ram-field">
            <span className="ram-field__label">Saving Throw Proficiencies</span>
            <div className="rule-save-toggles">
              {ABILITIES.map((ability) => {
                const proficient = statBlock.saveProficiencies.includes(ability);
                return (
                  <label key={ability}>
                    <input
                      type="checkbox"
                      checked={proficient}
                      onChange={() =>
                        patchStatBlock({
                          saveProficiencies: proficient
                            ? statBlock.saveProficiencies.filter(
                                (entry) => entry !== ability
                              )
                            : [...statBlock.saveProficiencies, ability],
                        })
                      }
                    />
                    <span>
                      {ability.toUpperCase()}{" "}
                      {formatMod(calculated.savingThrows[ability] ?? 0)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </RamSection>

        <RamSection title="Senses, Languages & Defenses">
          <div className="rule-choice-list">
            <RamField label="Senses">
              <TagInput
                values={statBlock.senses}
                suggestions={SENSE_TAGS}
                ariaLabel="Senses"
                onChange={(senses) => patchStatBlock({ senses })}
              />
            </RamField>
            <RamField label="Languages" hint="Leave empty for a creature that cannot speak.">
              <TagInput
                values={statBlock.languages}
                suggestions={LANGUAGE_TAGS}
                ariaLabel="Languages"
                onChange={(languages) => patchStatBlock({ languages })}
              />
            </RamField>
            <RamField label="Damage Vulnerabilities">
              <TagInput
                values={statBlock.vulnerabilities}
                suggestions={DAMAGE_TYPES}
                ariaLabel="Damage vulnerabilities"
                onChange={(vulnerabilities) => patchStatBlock({ vulnerabilities })}
              />
            </RamField>
            <RamField label="Damage Resistances">
              <TagInput
                values={statBlock.resistances}
                suggestions={DAMAGE_TYPES}
                ariaLabel="Damage resistances"
                onChange={(resistances) => patchStatBlock({ resistances })}
              />
            </RamField>
            <RamField label="Damage Immunities">
              <TagInput
                values={statBlock.damageImmunities}
                suggestions={DAMAGE_TYPES}
                ariaLabel="Damage immunities"
                onChange={(damageImmunities) => patchStatBlock({ damageImmunities })}
              />
            </RamField>
            <RamField label="Condition Immunities">
              <TagInput
                values={statBlock.conditionImmunities}
                suggestions={CONDITION_TAGS}
                ariaLabel="Condition immunities"
                onChange={(conditionImmunities) => patchStatBlock({ conditionImmunities })}
              />
            </RamField>
          </div>
        </RamSection>

        <RamSection title="Ability Scores">
          <div className="ability-records creature-ability-records">
            {ABILITIES.map((ability) => (
              <label className="ability-record" key={ability}>
                <span>{ability.toUpperCase()}</span>
                <RamInput
                  type="number"
                  min={1}
                  value={value.abilities[ability]}
                  onChange={(event) =>
                    onChange({
                      abilities: {
                        ...value.abilities,
                        [ability]: Math.max(1, Number(event.target.value) || 1),
                      },
                    })
                  }
                />
                <strong>{formatMod(calculated.savingThrows[ability] ?? 0)} save</strong>
              </label>
            ))}
          </div>
        </RamSection>

        <CalculatedStats
          calculated={calculated}
          hp={value.hp}
          onHpChange={(hp) => onChange({ hp })}
        />

        <SkillsEditor
          skills={value.skills}
          printedTotals
          onChange={(skills) => onChange({ skills })}
        />
        <ListEditor
          title="Special Traits"
          singular="trait"
          values={value.traits}
          onChange={(traits) => onChange({ traits })}
        />
        <ListEditor
          title="Actions"
          singular="action"
          values={value.features}
          onChange={(features) => onChange({ features })}
        />

        <WalletEditor
          wallet={value.wallet}
          onChange={(wallet) => onChange({ wallet })}
        />
        <EquipmentEditor
          inventory={value.inventory}
          libraryItems={libraryItems}
          onChange={(inventory) => onChange({ inventory })}
        />
        <InventoryEditor
          inventory={value.inventory}
          onChange={(inventory) => onChange({ inventory })}
        />
      </div>
    );
  }

  return (
    <div
      className={`creature-mechanics-editor${
        pcMode ? " creature-mechanics-editor--pc" : ""
      }`}
    >
      {showBuild && (
      <RamSection title="Ancestry & Class" action={basisToggle}>
        <div className="ram-field-grid ram-field-grid--2">
          <RamField label="Race">
            <RamSelect
              value={value.raceId}
              disabled={races.length === 0}
              onChange={(event) => selectRule("raceId", "race", event.target.value)}
            >
              {races.map((rule) => (
                <option value={rule.id} key={rule.id}>
                  {rule.name}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <RamField label="Subrace">
            <RamSelect
              value={value.subraceId}
              disabled={subraces.length === 0}
              onChange={(event) => selectRule("subraceId", "subrace", event.target.value)}
            >
              <option value="">No subrace</option>
              {subraces.map((rule) => (
                <option value={rule.id} key={rule.id}>
                  {rule.name}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <RamField label="Class">
            <RamSelect
              value={value.classId}
              disabled={classes.length === 0}
              onChange={(event) => selectRule("classId", "className", event.target.value)}
            >
              {classes.map((rule) => (
                <option value={rule.id} key={rule.id}>
                  {rule.name}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <RamField
            label="Subclass"
            hint={
              subclasses.length > 0 &&
              subclasses.every((rule) => (rule.minLevel ?? 1) > value.level)
                ? `Available at level ${Math.min(
                    ...subclasses.map((rule) => rule.minLevel ?? 1)
                  )}`
                : undefined
            }
          >
            <RamSelect
              value={value.subclassId}
              disabled={subclasses.length === 0}
              onChange={(event) => selectRule("subclassId", "subclass", event.target.value)}
            >
              <option value="">No subclass</option>
              {subclasses.map((rule) => (
                <option
                  value={rule.id}
                  key={rule.id}
                  disabled={(rule.minLevel ?? 1) > value.level}
                >
                  {rule.name}
                  {(rule.minLevel ?? 1) > value.level
                    ? ` — Level ${rule.minLevel}`
                    : ""}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <RamField label="Background">
            <RamSelect
              value={value.backgroundId}
              disabled={backgrounds.length === 0}
              onChange={(event) =>
                selectRule("backgroundId", "backgroundName", event.target.value)
              }
            >
              <option value="">No background</option>
              {backgrounds.map((rule) => (
                <option value={rule.id} key={rule.id}>
                  {rule.name}
                </option>
              ))}
            </RamSelect>
          </RamField>
          {pcMode ? (
            <p className="ancestry-profile-line span-all">
              {titleCase(profile.size)} {profile.creatureType}
            </p>
          ) : (
            <>
              <RamField label="Creature Type">
                <RamSelect
                  value={value.creatureType}
                  onChange={(event) =>
                    onChange({
                      creatureType: event.target.value as CreatureMechanics["creatureType"],
                    })
                  }
                >
                  {CREATURE_TYPES.map((type) => (
                    <option value={type} key={type}>
                      {type[0].toUpperCase() + type.slice(1)}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
              <RamField label="Creature Size">
                <RamSelect
                  value={value.size}
                  onChange={(event) =>
                    onChange({ size: event.target.value as CreatureMechanics["size"] })
                  }
                >
                  {CREATURE_SIZES.map((size) => (
                    <option value={size} key={size}>
                      {size[0].toUpperCase() + size.slice(1)}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
            </>
          )}
        </div>
      </RamSection>
      )}

      {showBuild && availableChoices.length > 0 && (
        <RamSection
          title="Character Choices"
          action={
            <RamBadge tone={choiceProgress.have < choiceProgress.need ? "danger" : "brass"}>
              {choiceProgress.have} / {choiceProgress.need}
            </RamBadge>
          }
        >
          <div className="pc-choice-list">
            {choiceGroups.map(({ rule, items }) => (
              <div className="pc-choice-group" key={rule.id}>
                <span className="pc-choice-group__title">{rule.name}</span>
                {items.map(({ choice }) => {
                  const key = `${rule.id}:${choice.id}`;
                  return (
                    <RuleChoiceCard
                      key={key}
                      choice={choice}
                      values={value.ruleChoices?.[key] ?? []}
                      level={value.level}
                      onChange={(nextValues) =>
                        onChange({
                          ruleChoices: {
                            ...(value.ruleChoices ?? {}),
                            [key]: nextValues,
                          },
                        })
                      }
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </RamSection>
      )}

      {showBuild && (
      <RamSection
        title="Level & Abilities"
        action={
          pcMode ? (
            <RamBadge tone={pointsRemaining < 0 ? "danger" : "brass"}>
              {pointsRemaining} / {ABILITY_POINT_BUY_BUDGET} points
            </RamBadge>
          ) : undefined
        }
      >
        <RamField label="Level" className="creature-level-field">
          <RamInput
            type="number"
            min={1}
            max={20}
            value={value.level}
            onChange={(event) =>
              onChange({
                level: Math.max(1, Math.min(20, Number(event.target.value) || 1)),
              })
            }
          />
        </RamField>
        <div className="ability-records creature-ability-records">
          {ABILITIES.map((ability) => (
            <label className="ability-record" key={ability}>
              <span>{ability.toUpperCase()}</span>
              {pcMode ? (
                <span className="ability-stepper">
                  <button
                    type="button"
                    disabled={value.abilities[ability] <= ABILITY_SCORE_MIN}
                    onClick={() => setAbility(ability, value.abilities[ability] - 1)}
                    aria-label={`Decrease ${ability.toUpperCase()}`}
                  >
                    <Minus size={13} />
                  </button>
                  <strong>{value.abilities[ability]}</strong>
                  <button
                    type="button"
                    disabled={
                      value.abilities[ability] >= ABILITY_SCORE_MAX ||
                      pointsRemaining <
                        abilityPointsSpent({
                          ...value.abilities,
                          [ability]: value.abilities[ability] + 1,
                        }) -
                          pointsSpent
                    }
                    onClick={() => setAbility(ability, value.abilities[ability] + 1)}
                    aria-label={`Increase ${ability.toUpperCase()}`}
                  >
                    <Plus size={13} />
                  </button>
                </span>
              ) : (
                <RamInput
                  type="number"
                  value={value.abilities[ability]}
                  onChange={(event) =>
                    onChange({
                      abilities: {
                        ...value.abilities,
                        [ability]: Number(event.target.value) || 0,
                      },
                    })
                  }
                />
              )}
              <strong>{formatMod(calculated.savingThrows[ability] ?? 0)} save</strong>
            </label>
          ))}
        </div>
      </RamSection>
      )}

      {showBuild && pcMode && (
        <AbilityImprovementsEditor
          value={value}
          calculated={calculated}
          onChange={onChange}
        />
      )}

      {showPlay && (
      <CalculatedStats
        calculated={calculated}
        hp={value.hp}
        onHpChange={(hp) => onChange({ hp })}
        hideHp={pcMode}
      />
      )}
      {showPlay && pcMode && (
        <ProgressionReference calculated={calculated} level={value.level} />
      )}

      {showBuild && (
      <SkillsEditor
        skills={value.skills}
        printedTotals={false}
        onChange={(skills) => onChange({ skills })}
      />
      )}
      {showPlay && (
      <ListEditor
        title="Custom Actions"
        singular="action"
        values={value.features}
        onChange={(features) => onChange({ features })}
      />
      )}

      {showPlay && (
        <>
      <WalletEditor wallet={value.wallet} onChange={(wallet) => onChange({ wallet })} />
      <EquipmentEditor
        inventory={value.inventory}
        libraryItems={libraryItems}
        onChange={(inventory) => onChange({ inventory })}
      />
      <InventoryEditor
        inventory={value.inventory}
        onChange={(inventory) => onChange({ inventory })}
      />
        </>
      )}
    </div>
  );
}
