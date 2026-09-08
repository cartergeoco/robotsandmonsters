import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createBlankRule } from "../ruleCatalog";
import { useRAM } from "../store";
import {
  CONDITION_TAGS,
  CREATURE_SIZES,
  CREATURE_TYPES,
  DAMAGE_TYPES,
  LANGUAGE_TAGS,
  PROFICIENCY_TAGS,
  RULE_KINDS,
  SENSE_TAGS,
  type AbilityScores,
  type RuleDefinition,
  type RuleKind,
} from "../types";
import {
  RamField,
  RamIconButton,
  RamInput,
  RamSelect,
  RamTextarea,
} from "./ui/RamPrimitives";
import { TagInput } from "./ui/TagInput";

const LABELS: Record<RuleKind, string> = {
  race: "Races",
  subrace: "Subraces",
  class: "Classes",
  subclass: "Subclasses",
  background: "Backgrounds",
};

const ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;

function RuleNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <RamField label={label}>
      <RamInput
        type="number"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </RamField>
  );
}

export function RulesLibrary() {
  const rules = useRAM((state) => state.ruleDefinitions);
  const addRule = useRAM((state) => state.addRuleDefinition);
  const updateRule = useRAM((state) => state.updateRuleDefinition);
  const deleteRule = useRAM((state) => state.deleteRuleDefinition);
  const [kind, setKind] = useState<RuleKind>("race");
  const [selectedId, setSelectedId] = useState("");
  const visible = useMemo(
    () =>
      rules
        .filter((rule) => rule.kind === kind)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [kind, rules]
  );
  const selected = rules.find((rule) => rule.id === selectedId) ?? visible[0];
  const parentKind = selected?.kind === "subrace" ? "race" : "class";
  const parentOptions =
    selected?.kind === "subrace" || selected?.kind === "subclass"
      ? rules
          .filter((rule) => rule.kind === parentKind)
          .sort((a, b) => a.name.localeCompare(b.name))
      : [];

  useEffect(() => {
    if (!selected || selected.kind !== kind) setSelectedId(visible[0]?.id ?? "");
  }, [kind, selected, visible]);

  function create() {
    const rule = createBlankRule(kind);
    addRule(rule);
    setSelectedId(rule.id);
  }

  function duplicate(rule: RuleDefinition) {
    const copy: RuleDefinition = {
      ...rule,
      id: crypto.randomUUID(),
      name: `${rule.name} Copy`,
      abilityBonuses: { ...rule.abilityBonuses },
      saveBonuses: { ...rule.saveBonuses },
      saveProficiencies: [...rule.saveProficiencies],
      proficiencies: [...rule.proficiencies],
      skillBonuses: rule.skillBonuses.map((skill) => ({
        ...skill,
        id: crypto.randomUUID(),
      })),
      senses: [...rule.senses],
      languages: [...rule.languages],
      vulnerabilities: [...rule.vulnerabilities],
      resistances: [...rule.resistances],
      damageImmunities: [...rule.damageImmunities],
      conditionImmunities: [...rule.conditionImmunities],
      specialActions: [...rule.specialActions],
      features: rule.features.map((feature) => ({ ...feature })),
      unarmoredAcAbilities: [...rule.unarmoredAcAbilities],
      startingKit: (rule.startingKit ?? []).map((entry) => ({ ...entry })),
      choices: (rule.choices ?? []).map((choice) => ({
        ...choice,
        options: [...choice.options],
      })),
    };
    addRule(copy);
    setSelectedId(copy.id);
  }

  const setAbility = (
    field: "abilityBonuses" | "saveBonuses",
    ability: keyof AbilityScores,
    value: number
  ) => {
    if (!selected) return;
    updateRule(selected.id, {
      [field]: { ...selected[field], [ability]: value },
    });
  };

  return (
    <div className="item-library rules-library">
      <nav className="item-category-tabs" aria-label="Rule categories">
        {RULE_KINDS.map((entry) => (
          <button
            key={entry}
            className={entry === kind ? "is-active" : ""}
            aria-current={entry === kind ? "page" : undefined}
            onClick={() => setKind(entry)}
          >
            <span>{LABELS[entry]}</span>
            <small>{rules.filter((rule) => rule.kind === entry).length}</small>
          </button>
        ))}
      </nav>

      <div className="item-catalog">
        <div className="library-column-header">
          <span>{LABELS[kind]}</span>
          <RamIconButton label={`Create ${kind}`} onClick={create}>
            <Plus size={17} strokeWidth={1.5} />
          </RamIconButton>
        </div>
        <div className="item-catalog-list">
          {visible.map((rule) => (
            <button
              key={rule.id}
              className={rule.id === selected?.id ? "is-selected" : ""}
              onClick={() => setSelectedId(rule.id)}
            >
              <span>{rule.name}</span>
              <small>{rule.parentId ? "Inherited rule" : "Base rule"}</small>
            </button>
          ))}
          {visible.length === 0 && (
            <span className="token-catalog-empty">No {LABELS[kind].toLowerCase()} yet.</span>
          )}
        </div>
      </div>

      <div className="item-editor rules-editor">
        {selected ? (
          <>
            <div className="token-editor-header">
              <span className="ram-eyebrow">Mechanical rule</span>
              <span className="token-editor-header__actions">
                <RamIconButton label={`Duplicate ${selected.name}`} onClick={() => duplicate(selected)}>
                  <Copy size={16} strokeWidth={1.5} />
                </RamIconButton>
                <RamIconButton
                  label={`Delete ${selected.name}`}
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete ${selected.name} and any child rules?`)) {
                      deleteRule(selected.id);
                      setSelectedId("");
                    }
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </RamIconButton>
              </span>
            </div>

            <div className="item-editor-fields">
              <RamField label="Name" className="span-all">
                <RamInput
                  value={selected.name}
                  onChange={(event) => updateRule(selected.id, { name: event.target.value })}
                />
              </RamField>
              {parentOptions.length > 0 && (
                <RamField label={parentKind === "race" ? "Parent Race" : "Parent Class"}>
                  <RamSelect
                    value={selected.parentId ?? ""}
                    onChange={(event) =>
                      updateRule(selected.id, { parentId: event.target.value || undefined })
                    }
                  >
                    <option value="">None</option>
                    {parentOptions.map((parent) => (
                      <option value={parent.id} key={parent.id}>
                        {parent.name}
                      </option>
                    ))}
                  </RamSelect>
                </RamField>
              )}
              <RuleNumber
                label="Flat HP / Level"
                value={selected.hpPerLevel}
                onChange={(hpPerLevel) => updateRule(selected.id, { hpPerLevel })}
              />
              <RuleNumber
                label="Hit Die"
                value={selected.hitDie}
                onChange={(hitDie) => updateRule(selected.id, { hitDie })}
              />
              <RuleNumber
                label="Extra HP"
                value={selected.extraHp}
                onChange={(extraHp) => updateRule(selected.id, { extraHp })}
              />
              <RuleNumber
                label="AC Bonus"
                value={selected.armorBonus}
                onChange={(armorBonus) => updateRule(selected.id, { armorBonus })}
              />
              <RuleNumber
                label="Speed"
                value={selected.speed}
                onChange={(speed) => updateRule(selected.id, { speed })}
              />
              {(selected.kind === "race" || selected.kind === "subrace") && (
                <>
                  <RamField label="Creature Size">
                    <RamSelect
                      value={selected.creatureSize ?? ""}
                      onChange={(event) =>
                        updateRule(selected.id, {
                          creatureSize:
                            (event.target.value as RuleDefinition["creatureSize"]) || undefined,
                        })
                      }
                    >
                      <option value="">Inherited</option>
                      {CREATURE_SIZES.map((size) => (
                        <option value={size} key={size}>
                          {size[0].toUpperCase() + size.slice(1)}
                        </option>
                      ))}
                    </RamSelect>
                  </RamField>
                  <RamField label="Creature Type">
                    <RamSelect
                      value={selected.creatureType ?? ""}
                      onChange={(event) =>
                        updateRule(selected.id, {
                          creatureType:
                            (event.target.value as RuleDefinition["creatureType"]) || undefined,
                        })
                      }
                    >
                      <option value="">Inherited</option>
                      {CREATURE_TYPES.map((type) => (
                        <option value={type} key={type}>
                          {type[0].toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </RamSelect>
                  </RamField>
                </>
              )}
            </div>

            <span className="ram-field__label">Ability Bonuses</span>
            <div className="rule-ability-grid">
              {ABILITIES.map((ability) => (
                <RuleNumber
                  key={ability}
                  label={ability.toUpperCase()}
                  value={selected.abilityBonuses[ability] ?? 0}
                  onChange={(value) => setAbility("abilityBonuses", ability, value)}
                />
              ))}
            </div>

            <span className="ram-field__label">Save Bonuses</span>
            <div className="rule-ability-grid">
              {ABILITIES.map((ability) => (
                <RuleNumber
                  key={ability}
                  label={ability.toUpperCase()}
                  value={selected.saveBonuses[ability] ?? 0}
                  onChange={(value) => setAbility("saveBonuses", ability, value)}
                />
              ))}
            </div>

            <RamField label="Saving Throw Proficiencies">
              <div className="rule-save-toggles">
                {ABILITIES.map((ability) => (
                  <label key={ability}>
                    <input
                      type="checkbox"
                      checked={selected.saveProficiencies.includes(ability)}
                      onChange={(event) =>
                        updateRule(selected.id, {
                          saveProficiencies: event.target.checked
                            ? [...selected.saveProficiencies, ability]
                            : selected.saveProficiencies.filter((entry) => entry !== ability),
                        })
                      }
                    />
                    {ability.toUpperCase()}
                  </label>
                ))}
              </div>
            </RamField>

            {(
              [
                ["proficiencies", "Proficiencies"],
                ["senses", "Senses"],
                ["languages", "Languages"],
                ["vulnerabilities", "Vulnerabilities"],
                ["resistances", "Resistances"],
                ["damageImmunities", "Damage Immunities"],
                ["conditionImmunities", "Condition Immunities"],
                ["specialActions", "Special Actions"],
              ] as const
            ).map(([field, label]) => (
              <RamField label={label} key={field}>
                <TagInput
                  values={selected[field]}
                  suggestions={
                    field === "proficiencies"
                      ? PROFICIENCY_TAGS
                      : field === "senses"
                        ? SENSE_TAGS
                        : field === "languages"
                          ? LANGUAGE_TAGS
                          : field === "conditionImmunities"
                            ? CONDITION_TAGS
                            : field === "vulnerabilities" ||
                                field === "resistances" ||
                                field === "damageImmunities"
                              ? DAMAGE_TYPES
                              : []
                  }
                  ariaLabel={label}
                  placeholder="Type or browse tags…"
                  onChange={(values) => updateRule(selected.id, { [field]: values })}
                />
              </RamField>
            ))}

            <RamField label="Skills & Additions">
              <RamTextarea
                value={selected.skillBonuses
                  .map((skill) => `${skill.name}: ${skill.bonus}`)
                  .join("\n")}
                placeholder={"Perception: 2\nStealth: 1"}
                onChange={(event) =>
                  updateRule(selected.id, {
                    skillBonuses: event.target.value
                      .split("\n")
                      .map((line) => {
                        const [name, rawBonus] = line.split(":");
                        return {
                          id: crypto.randomUUID(),
                          name: name?.trim() ?? "",
                          bonus: Number(rawBonus) || 0,
                        };
                      })
                      .filter((skill) => skill.name),
                  })
                }
              />
            </RamField>

            <RamField label="Level Features">
              <RamTextarea
                value={selected.features
                  .map((feature) => `${feature.level}|${feature.name}|${feature.effect}`)
                  .join("\n")}
                placeholder={"1|Feature name|Compact mechanical effect\n3|Upgrade|What changes"}
                onChange={(event) =>
                  updateRule(selected.id, {
                    features: event.target.value
                      .split("\n")
                      .map((line) => {
                        const [rawLevel, name, ...effect] = line.split("|");
                        return {
                          level: Math.max(0, Number(rawLevel) || 0),
                          name: name?.trim() ?? "",
                          effect: effect.join("|").trim(),
                        };
                      })
                      .filter((feature) => feature.name),
                  })
                }
              />
            </RamField>

            <RamField label="Starting Kit">
              <RamTextarea
                value={(selected.startingKit ?? [])
                  .map(
                    (entry) =>
                      `${entry.libraryItemId}|${entry.qty}${entry.equipped ? "|*" : ""}`
                  )
                  .join("\n")}
                placeholder={"item-longsword|1|*\nitem-dungeoneers-pack|1"}
                onChange={(event) =>
                  updateRule(selected.id, {
                    startingKit: event.target.value
                      .split("\n")
                      .map((line) => {
                        const [libraryItemId, rawQty, flag] = line.split("|");
                        return {
                          libraryItemId: libraryItemId?.trim() ?? "",
                          qty: Math.max(1, Number(rawQty) || 1),
                          equipped: flag?.trim() === "*",
                        };
                      })
                      .filter((entry) => entry.libraryItemId),
                  })
                }
              />
            </RamField>

            <RamField
              label="Character Inputs"
              hint="id | label | target | count | comma-separated options | custom"
            >
              <RamTextarea
                value={(selected.choices ?? [])
                  .map(
                    (choice) =>
                      `${choice.id}|${choice.label}|${choice.target}|${choice.count}|${choice.options.join(
                        ", "
                      )}|${choice.allowCustom ? "custom" : ""}`
                  )
                  .join("\n")}
                placeholder="language|Bonus language|language|1|Elvish, Dwarvish|custom"
                onChange={(event) =>
                  updateRule(selected.id, {
                    choices: event.target.value
                      .split("\n")
                      .map((line) => {
                        const [id, label, target, rawCount, rawOptions, custom] =
                          line.split("|");
                        return {
                          id: id?.trim() ?? "",
                          label: label?.trim() ?? "",
                          target: (target?.trim() || "trait") as RuleDefinition["choices"][number]["target"],
                          count: Math.max(1, Number(rawCount) || 1),
                          options: (rawOptions ?? "")
                            .split(",")
                            .map((value) => value.trim())
                            .filter(Boolean),
                          allowCustom: custom?.trim().toLowerCase() === "custom",
                        };
                      })
                      .filter((choice) => choice.id && choice.label),
                  })
                }
              />
            </RamField>

            <RamField label="Notes">
              <RamTextarea
                value={selected.notes}
                onChange={(event) => updateRule(selected.id, { notes: event.target.value })}
              />
            </RamField>
          </>
        ) : (
          <div className="token-editor-placeholder">Create a rule to begin.</div>
        )}
      </div>
    </div>
  );
}
