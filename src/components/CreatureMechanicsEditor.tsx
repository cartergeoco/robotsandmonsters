import { Minus, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRAM } from "../store";
import {
  ABILITY_POINT_BUY_BUDGET,
  ABILITY_SCORE_MAX,
  ABILITY_SCORE_MIN,
  CREATURE_SIZES,
  CREATURE_TYPES,
  EQUIPMENT_SLOTS,
  abilityPointsSpent,
  activeCreatureRules,
  calculateCreatureStats,
  formatMod,
  inventoryFromKit,
  resolvedCreatureProfile,
  type AbilityScores,
  type CreatureMechanics,
  type EquipmentSlot,
  type Item,
  type LibraryItem,
  type Skill,
  type Trait,
} from "../types";
import {
  RamBadge,
  RamField,
  RamIconButton,
  RamInput,
  RamSection,
  RamSelect,
} from "./ui/RamPrimitives";
import { TagInput } from "./ui/TagInput";

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

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
      {values.length === 0 && <p className="sheet-empty-row">No custom actions.</p>}
      <div className="ram-list-editor">
        {values.map((value) => (
          <div className="ram-list-row ram-list-row--description" key={value.id}>
            <RamInput
              className="title"
              value={value.name}
              placeholder="Action"
              onChange={(event) =>
                onChange(
                  values.map((entry) =>
                    entry.id === value.id ? { ...entry, name: event.target.value } : entry
                  )
                )
              }
            />
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
            <RamIconButton
              label={`Remove ${value.name || singular}`}
              variant="danger"
              onClick={() => onChange(values.filter((entry) => entry.id !== value.id))}
            >
              <Trash2 size={15} />
            </RamIconButton>
          </div>
        ))}
      </div>
    </RamSection>
  );
}

function SkillsEditor({
  skills,
  onChange,
}: {
  skills: Skill[];
  onChange: (skills: Skill[]) => void;
}) {
  return (
    <RamSection
      title="Skill Modifiers"
      action={
        <RamIconButton
          label="Add skill modifier"
          onClick={() =>
            onChange([...skills, { id: crypto.randomUUID(), name: "", bonus: 0 }])
          }
        >
          <Plus size={15} />
        </RamIconButton>
      }
    >
      {skills.length === 0 && <p className="sheet-empty-row">No manual skill modifiers.</p>}
      <div className="ram-list-editor">
        {skills.map((skill) => (
          <div className="ram-list-row" key={skill.id}>
            <RamInput
              className="grow"
              value={skill.name}
              placeholder="Skill"
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
                value={equipped?.id ?? ""}
                disabled={disabled}
                onChange={(event) => equip(slot, event.target.value)}
              >
                <option value="">Empty</option>
                {sortedInventory.filter((item) => allowed(item, slot)).map((item) => (
                  <option value={item.id} key={item.id}>
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
    <RamSection
      title="Inventory"
      action={
        <RamIconButton label="Add selected item" onClick={addItem} disabled={!availableId}>
          <Plus size={15} />
        </RamIconButton>
      }
    >
      <RamField label="Add from Library">
        <RamSelect
          value={availableId}
          disabled={libraryItems.length === 0}
          onChange={(event) => setSelectedItemId(event.target.value)}
        >
          {libraryItems.length === 0 && <option value="">No library items</option>}
          {sortedLibraryItems.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name} — {item.category}
            </option>
          ))}
        </RamSelect>
      </RamField>
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
              className="grow"
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

export function CreatureMechanicsEditor({
  value,
  onChange,
  pcMode = false,
}: {
  value: CreatureMechanics;
  onChange: (patch: Partial<CreatureMechanics>) => void;
  pcMode?: boolean;
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
  const calculated = useMemo(
    () => calculateCreatureStats(value, rules, libraryItems),
    [value, rules, libraryItems]
  );
  const profile = resolvedCreatureProfile(value, rules);
  const pointsSpent = abilityPointsSpent(value.abilities);
  const pointsRemaining = ABILITY_POINT_BUY_BUDGET - pointsSpent;

  useEffect(() => {
    if (!pcMode) return;
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
  }, [classes, onChange, pcMode, races, value.classId, value.raceId]);

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

  return (
    <div className="creature-mechanics-editor">
      <RamSection title="Ancestry & Class">
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
          <RamField label="Subclass">
            <RamSelect
              value={value.subclassId}
              disabled={subclasses.length === 0}
              onChange={(event) => selectRule("subclassId", "subclass", event.target.value)}
            >
              <option value="">No subclass</option>
              {subclasses.map((rule) => (
                <option value={rule.id} key={rule.id}>
                  {rule.name}
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
            <div className="ancestry-profile">
              <span>
                <small>Type</small>
                <strong>{profile.creatureType}</strong>
              </span>
              <span>
                <small>Size</small>
                <strong>{profile.size}</strong>
              </span>
            </div>
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

      {activeRules.some((rule) => (rule.choices ?? []).length > 0) && (
        <RamSection title="Character Choices">
          <div className="rule-choice-list">
            {activeRules.flatMap((rule) =>
              (rule.choices ?? []).map((choice) => {
                const key = `${rule.id}:${choice.id}`;
                const values = value.ruleChoices?.[key] ?? [];
                return (
                  <RamField
                    label={`${rule.name} — ${choice.label}`}
                    hint={`Choose ${choice.count}`}
                    key={key}
                  >
                    <TagInput
                      values={values}
                      suggestions={choice.options}
                      max={choice.count}
                      allowCustom={choice.allowCustom}
                      ariaLabel={choice.label}
                      onChange={(nextValues) =>
                        onChange({
                          ruleChoices: {
                            ...(value.ruleChoices ?? {}),
                            [key]: nextValues,
                          },
                        })
                      }
                    />
                  </RamField>
                );
              })
            )}
          </div>
        </RamSection>
      )}

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
            value={value.level}
            onChange={(event) =>
              onChange({ level: Math.max(1, Number(event.target.value) || 1) })
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

      <RamSection title="Calculated Stats">
        <div className="calculated-stat-grid">
          <span><small>Max HP</small><strong>{calculated.maxHp}</strong></span>
          <span><small>Armor Class</small><strong>{calculated.armorClass}</strong></span>
          <span><small>Proficiency</small><strong>{formatMod(calculated.proficiencyBonus)}</strong></span>
          <span><small>Save DC</small><strong>{calculated.saveDc}</strong></span>
          <span><small>Speed</small><strong>{calculated.speed || "—"}</strong></span>
          <span>
            <small>Current HP</small>
            <RamInput
              type="number"
              min={0}
              value={value.hp}
              onChange={(event) =>
                onChange({ hp: Math.max(0, Number(event.target.value) || 0) })
              }
            />
          </span>
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

      <SkillsEditor skills={value.skills} onChange={(skills) => onChange({ skills })} />
      <ListEditor
        title="Custom Actions"
        singular="action"
        values={value.features}
        onChange={(features) => onChange({ features })}
      />

      <RamSection title="Wallet">
        <div className="ram-field-grid ram-field-grid--3">
          {(["gold", "silver", "copper"] as const).map((coin) => (
            <RamField label={coin[0].toUpperCase() + coin.slice(1)} key={coin}>
              <RamInput
                type="number"
                min={0}
                value={value.wallet[coin]}
                onChange={(event) =>
                  onChange({
                    wallet: {
                      ...value.wallet,
                      [coin]: Math.max(0, Number(event.target.value) || 0),
                    },
                  })
                }
              />
            </RamField>
          ))}
        </div>
      </RamSection>
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
