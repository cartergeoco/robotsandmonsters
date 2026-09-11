import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createBlankRule } from "../ruleCatalog";
import { useRAM } from "../store";
import { flushCampaignWrites } from "../persistStorage";
import { useLibraryDraft } from "../useLibraryDraft";
import { useLibraryUnsaved, useRegisterUnsaved } from "../libraryUnsaved";
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
  type RuleChoiceDefinition,
  type RuleChoiceTarget,
  type RuleDefinition,
  type RuleFeature,
  type RuleKind,
  type Skill,
  type StartingKitItem,
} from "../types";
import { itemRarityClassName, itemRarityStyle } from "./ItemName";
import {
  RamConfirmDialog,
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

const CHOICE_TARGETS: Array<{
  value: RuleChoiceTarget;
  label: string;
  hint: string;
}> = [
  { value: "trait", label: "Trait or ancestry", hint: "Saved on the character as a trait." },
  { value: "ability", label: "Ability scores", hint: "Adds to the chosen ability scores." },
  { value: "language", label: "Languages", hint: "Adds known languages." },
  { value: "proficiency", label: "Skills or tools", hint: "Adds skill or tool proficiencies." },
  { value: "expertise", label: "Expertise", hint: "Doubles proficiency for selected skills or tools." },
  { value: "action", label: "Actions or spells", hint: "Adds special actions." },
];

function choiceOptionSuggestions(target: RuleChoiceTarget): readonly string[] {
  if (target === "ability") return ABILITIES;
  if (target === "language") return LANGUAGE_TAGS;
  if (target === "proficiency" || target === "expertise") return PROFICIENCY_TAGS;
  return [];
}

function RuleListBlock({
  label,
  hint,
  onAdd,
  addLabel,
  children,
}: {
  label: string;
  hint?: string;
  onAdd: () => void;
  addLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="rule-list-block">
      <div className="rule-list-block__header">
        <span className="ram-field__label">{label}</span>
        <RamIconButton label={addLabel} onClick={onAdd}>
          <Plus size={16} />
        </RamIconButton>
      </div>
      {hint && <span className="ram-field__hint">{hint}</span>}
      {children}
    </div>
  );
}

function SkillsEditor({
  values,
  onChange,
}: {
  values: Skill[];
  onChange: (values: Skill[]) => void;
}) {
  return (
    <RuleListBlock
      label="Skills & Additions"
      hint="Fixed bonuses this rule always grants, like Perception +2."
      addLabel="Add skill bonus"
      onAdd={() => onChange([...values, { id: crypto.randomUUID(), name: "", bonus: 0 }])}
    >
      {values.length === 0 && <p className="sheet-empty-row">No skill bonuses yet.</p>}
      <div className="ram-list-editor">
        {values.map((skill, index) => (
          <div className="ram-list-row" key={skill.id}>
            <RamInput
              className="grow"
              value={skill.name}
              placeholder="Skill name"
              aria-label="Skill name"
              onChange={(event) =>
                onChange(
                  values.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, name: event.target.value } : entry
                  )
                )
              }
            />
            <RamInput
              className="numeric"
              type="number"
              value={skill.bonus}
              aria-label={`${skill.name || "Skill"} bonus`}
              onChange={(event) =>
                onChange(
                  values.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, bonus: Number(event.target.value) || 0 }
                      : entry
                  )
                )
              }
            />
            <RamIconButton
              label={`Remove ${skill.name || "skill bonus"}`}
              variant="danger"
              onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}
            >
              <Trash2 size={16} />
            </RamIconButton>
          </div>
        ))}
      </div>
    </RuleListBlock>
  );
}

function FeaturesEditor({
  values,
  onChange,
}: {
  values: RuleFeature[];
  onChange: (values: RuleFeature[]) => void;
}) {
  return (
    <RuleListBlock
      label="Level Features"
      hint="What this rule unlocks, and at which character level."
      addLabel="Add feature"
      onAdd={() =>
        onChange([
          ...values,
          { level: Math.max(1, values[values.length - 1]?.level ?? 1), name: "", effect: "" },
        ])
      }
    >
      {values.length === 0 && <p className="sheet-empty-row">No features yet.</p>}
      <div className="ram-list-editor">
        {values.map((feature, index) => (
          <div className="rule-feature-card" key={`${feature.level}-${feature.name}-${index}`}>
            <div className="ram-list-row">
              <RamInput
                className="numeric"
                type="number"
                min={0}
                value={feature.level}
                aria-label="Feature level"
                title="Level"
                onChange={(event) =>
                  onChange(
                    values.map((entry, entryIndex) =>
                      entryIndex === index
                        ? { ...entry, level: Math.max(0, Number(event.target.value) || 0) }
                        : entry
                    )
                  )
                }
              />
              <RamInput
                className="grow"
                value={feature.name}
                placeholder="Feature name"
                aria-label="Feature name"
                onChange={(event) =>
                  onChange(
                    values.map((entry, entryIndex) =>
                      entryIndex === index ? { ...entry, name: event.target.value } : entry
                    )
                  )
                }
              />
              <RamIconButton
                label={`Remove ${feature.name || "feature"}`}
                variant="danger"
                onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}
              >
                <Trash2 size={16} />
              </RamIconButton>
            </div>
            <RamTextarea
              className="rule-feature-effect"
              value={feature.effect}
              placeholder="What this feature does"
              aria-label={`${feature.name || "Feature"} effect`}
              onChange={(event) =>
                onChange(
                  values.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, effect: event.target.value } : entry
                  )
                )
              }
            />
            <RamField
              label="Expertise Grants"
              hint="Skills or tools that receive double proficiency while this feature is unlocked."
            >
              <TagInput
                values={feature.grants?.expertise ?? []}
                suggestions={PROFICIENCY_TAGS}
                ariaLabel={`${feature.name || "Feature"} expertise grants`}
                placeholder="Add skill or tool…"
                onChange={(expertise) =>
                  onChange(
                    values.map((entry, entryIndex) =>
                      entryIndex === index
                        ? {
                            ...entry,
                            grants: { ...entry.grants, expertise },
                          }
                        : entry
                    )
                  )
                }
              />
            </RamField>
            <div className="ram-field">
              <span className="ram-field__label">Half-Proficiency Ability Checks</span>
              <div className="rule-save-toggles">
                {ABILITIES.map((ability) => {
                  const selected =
                    feature.grants?.halfProficiencyAbilities?.includes(ability) ?? false;
                  return (
                    <label key={ability}>
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(event) =>
                          onChange(
                            values.map((entry, entryIndex) =>
                              entryIndex === index
                                ? {
                                    ...entry,
                                    grants: {
                                      ...entry.grants,
                                      halfProficiencyAbilities: event.target.checked
                                        ? [
                                            ...new Set([
                                              ...(entry.grants?.halfProficiencyAbilities ?? []),
                                              ability,
                                            ]),
                                          ]
                                        : (
                                            entry.grants?.halfProficiencyAbilities ?? []
                                          ).filter((value) => value !== ability),
                                    },
                                  }
                                : entry
                            )
                          )
                        }
                      />
                      {ability.toUpperCase()}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </RuleListBlock>
  );
}

function StartingKitEditor({
  values,
  onChange,
}: {
  values: StartingKitItem[];
  onChange: (values: StartingKitItem[]) => void;
}) {
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const sortedLibraryItems = useMemo(
    () => [...libraryItems].sort((a, b) => a.name.localeCompare(b.name)),
    [libraryItems]
  );
  const [selectedItemId, setSelectedItemId] = useState("");
  const availableId = selectedItemId || sortedLibraryItems[0]?.id || "";
  const selectedLibraryItem = libraryItems.find((item) => item.id === availableId);

  function addItem() {
    if (!availableId) return;
    onChange([...values, { libraryItemId: availableId, qty: 1, equipped: false }]);
  }

  return (
    <div className="rule-list-block">
      <div className="rule-list-block__header">
        <span className="ram-field__label">Starting Kit</span>
        <RamIconButton label="Add selected item" onClick={addItem} disabled={!availableId}>
          <Plus size={16} />
        </RamIconButton>
      </div>
      <span className="ram-field__hint">Items this rule gives a new character.</span>
      <RamField label="Add from library">
        <RamSelect
          className={itemRarityClassName(selectedLibraryItem?.rarity)}
          value={availableId}
          disabled={libraryItems.length === 0}
          onChange={(event) => setSelectedItemId(event.target.value)}
        >
          {libraryItems.length === 0 && <option value="">No library items</option>}
          {sortedLibraryItems.map((item) => (
            <option value={item.id} key={item.id} style={itemRarityStyle(item.rarity)}>
              {item.name} — {item.category}
            </option>
          ))}
        </RamSelect>
      </RamField>
      {values.length === 0 && <p className="sheet-empty-row">No starting items yet.</p>}
      <div className="ram-list-editor">
        {values.map((entry, index) => {
          const item = libraryItems.find((candidate) => candidate.id === entry.libraryItemId);
          const missing = Boolean(entry.libraryItemId) && !item;
          return (
            <div className="ram-list-row rule-kit-row" key={`${entry.libraryItemId}-${index}`}>
              <RamSelect
                className={`grow ${itemRarityClassName(item?.rarity)}`}
                value={entry.libraryItemId}
                aria-label="Starting item"
                onChange={(event) =>
                  onChange(
                    values.map((kitEntry, entryIndex) =>
                      entryIndex === index
                        ? { ...kitEntry, libraryItemId: event.target.value }
                        : kitEntry
                    )
                  )
                }
              >
                {missing && (
                  <option value={entry.libraryItemId}>Missing item ({entry.libraryItemId})</option>
                )}
                {sortedLibraryItems.map((libraryItem) => (
                  <option
                    value={libraryItem.id}
                    key={libraryItem.id}
                    style={itemRarityStyle(libraryItem.rarity)}
                  >
                    {libraryItem.name}
                  </option>
                ))}
              </RamSelect>
              <RamInput
                className="numeric"
                type="number"
                min={1}
                value={entry.qty}
                aria-label="Quantity"
                onChange={(event) =>
                  onChange(
                    values.map((kitEntry, entryIndex) =>
                      entryIndex === index
                        ? { ...kitEntry, qty: Math.max(1, Number(event.target.value) || 1) }
                        : kitEntry
                    )
                  )
                }
              />
              <label className="equip-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(entry.equipped)}
                  onChange={(event) =>
                    onChange(
                      values.map((kitEntry, entryIndex) =>
                        entryIndex === index
                          ? { ...kitEntry, equipped: event.target.checked }
                          : kitEntry
                      )
                    )
                  }
                />
                Equipped
              </label>
              <RamIconButton
                label={`Remove ${item?.name || "item"}`}
                variant="danger"
                onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}
              >
                <Trash2 size={16} />
              </RamIconButton>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChoicesEditor({
  values,
  onChange,
}: {
  values: RuleChoiceDefinition[];
  onChange: (values: RuleChoiceDefinition[]) => void;
}) {
  return (
    <RuleListBlock
      label="Character Inputs"
      hint="Questions a player answers when they take this rule, like ancestry or bonus languages."
      addLabel="Add character input"
      onAdd={() =>
        onChange([
          ...values,
          {
            id: crypto.randomUUID(),
            label: "",
            target: "trait",
            level: 1,
            count: 1,
            options: [],
            allowCustom: false,
          },
        ])
      }
    >
      {values.length === 0 && <p className="sheet-empty-row">No character inputs yet.</p>}
      <div className="ram-list-editor">
        {values.map((choice, index) => {
          const targetHint =
            CHOICE_TARGETS.find((entry) => entry.value === choice.target)?.hint ?? "";
          return (
            <div className="rule-choice-card" key={choice.id}>
              <div className="ram-list-row rule-choice-card__top">
                <RamInput
                  className="grow"
                  value={choice.label}
                  placeholder="Prompt shown to the player"
                  aria-label="Choice prompt"
                  onChange={(event) =>
                    onChange(
                      values.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, label: event.target.value } : entry
                      )
                    )
                  }
                />
                <RamIconButton
                  label={`Remove ${choice.label || "character input"}`}
                  variant="danger"
                  onClick={() => onChange(values.filter((_, entryIndex) => entryIndex !== index))}
                >
                  <Trash2 size={16} />
                </RamIconButton>
              </div>
              <div className="rule-choice-card__meta">
                <RamField label="Unlock Level">
                  <RamInput
                    type="number"
                    min={1}
                    max={20}
                    value={choice.level ?? 1}
                    aria-label="Choice unlock level"
                    onChange={(event) =>
                      onChange(
                        values.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                level: Math.max(
                                  1,
                                  Math.min(20, Number(event.target.value) || 1)
                                ),
                              }
                            : entry
                        )
                      )
                    }
                  />
                </RamField>
                <RamField label="Applies to" hint={targetHint}>
                  <RamSelect
                    value={choice.target}
                    aria-label="What this choice applies to"
                    onChange={(event) =>
                      onChange(
                        values.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                target: event.target.value as RuleChoiceTarget,
                              }
                            : entry
                        )
                      )
                    }
                  >
                    {CHOICE_TARGETS.map((target) => (
                      <option value={target.value} key={target.value}>
                        {target.label}
                      </option>
                    ))}
                  </RamSelect>
                </RamField>
                <RamField label="How many">
                  <RamInput
                    type="number"
                    min={1}
                    value={choice.count}
                    aria-label="Number of selections"
                    onChange={(event) =>
                      onChange(
                        values.map((entry, entryIndex) =>
                          entryIndex === index
                            ? { ...entry, count: Math.max(1, Number(event.target.value) || 1) }
                            : entry
                        )
                      )
                    }
                  />
                </RamField>
              </div>
              <RamField
                label="Level-Scaled Counts"
                hint="Optional level:count pairs, for example 5:3. The latest unlocked count wins."
              >
                <TagInput
                  values={(choice.levelCounts ?? []).map(
                    (entry) => `${entry.level}:${entry.count}`
                  )}
                  suggestions={[]}
                  ariaLabel={`${choice.label || "Choice"} level-scaled counts`}
                  placeholder="5:3"
                  onChange={(entries) =>
                    onChange(
                      values.map((entry, entryIndex) =>
                        entryIndex === index
                          ? {
                              ...entry,
                              levelCounts: entries
                                .map((value) => {
                                  const match = value.match(/^(\d+)\s*:\s*(\d+)$/);
                                  return match
                                    ? {
                                        level: Math.max(
                                          1,
                                          Math.min(20, Number(match[1]))
                                        ),
                                        count: Math.max(1, Number(match[2])),
                                      }
                                    : null;
                                })
                                .filter(
                                  (
                                    value
                                  ): value is { level: number; count: number } =>
                                    value !== null
                                )
                                .sort((a, b) => a.level - b.level),
                            }
                          : entry
                      )
                    )
                  }
                />
              </RamField>
              <RamField
                label="Options"
                hint="Choices the player can pick. Leave empty if they should type their own."
              >
                <TagInput
                  values={choice.options}
                  suggestions={choiceOptionSuggestions(choice.target)}
                  ariaLabel={`${choice.label || "Choice"} options`}
                  placeholder="Type an option and press Enter"
                  onChange={(options) =>
                    onChange(
                      values.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, options } : entry
                      )
                    )
                  }
                />
              </RamField>
              <label className="equip-toggle">
                <input
                  type="checkbox"
                  checked={Boolean(choice.allowCustom)}
                  onChange={(event) =>
                    onChange(
                      values.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, allowCustom: event.target.checked }
                          : entry
                      )
                    )
                  }
                />
                Players can type their own answer
              </label>
            </div>
          );
        })}
      </div>
    </RuleListBlock>
  );
}

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
  const confirmDeletes = useRAM((state) => state.uiSettings.confirmDeletes);
  const [kind, setKind] = useState<RuleKind>("race");
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("ram-recent-rules") || "[]");
    } catch {
      return [];
    }
  });
  const [deleteTarget, setDeleteTarget] = useState<RuleDefinition | undefined>();
  const visible = useMemo(
    () =>
      rules
        .filter((rule) => rule.kind === kind)
        .filter((rule) => {
          const needle = query.trim().toLocaleLowerCase();
          return !needle ||
            rule.name.toLocaleLowerCase().includes(needle) ||
            rule.notes.toLocaleLowerCase().includes(needle) ||
            rule.features.some((feature) =>
              `${feature.name} ${feature.effect}`.toLocaleLowerCase().includes(needle)
            );
        })
        .sort((a, b) => {
          const ai = recentIds.indexOf(a.id);
          const bi = recentIds.indexOf(b.id);
          if (ai >= 0 || bi >= 0) {
            if (ai < 0) return 1;
            if (bi < 0) return -1;
            return ai - bi;
          }
          return a.name.localeCompare(b.name);
        }),
    [kind, query, recentIds, rules]
  );
  const stored = rules.find((rule) => rule.id === selectedId) ?? visible[0];
  const { draft: selected, dirty, patch, save, discard } = useLibraryDraft(stored, (value) => {
    updateRule(value.id, value);
    flushCampaignWrites();
  });
  useRegisterUnsaved(dirty, save, discard);
  const { requestLeave } = useLibraryUnsaved();
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
    requestLeave(() => {
      const rule = createBlankRule(kind);
      addRule(rule);
      setSelectedId(rule.id);
    });
  }

  function selectRule(id: string) {
    if (id === selected?.id) return;
    requestLeave(() => {
      setSelectedId(id);
      const next = [id, ...recentIds.filter((entry) => entry !== id)].slice(0, 8);
      setRecentIds(next);
      localStorage.setItem("ram-recent-rules", JSON.stringify(next));
    });
  }

  function duplicate(rule: RuleDefinition) {
    const copy: RuleDefinition = {
      ...rule,
      id: crypto.randomUUID(),
      name: `${rule.name} Copy`,
      abilityScoreImprovementLevels: [...(rule.abilityScoreImprovementLevels ?? [])],
      resourceTracks: (rule.resourceTracks ?? []).map((track) => ({
        ...track,
        values: track.values.map((value) => ({ ...value })),
      })),
      spellcasting: rule.spellcasting
        ? {
            ...rule.spellcasting,
            slotsByLevel: rule.spellcasting.slotsByLevel.map((row) => [...row]),
            slotLevels: rule.spellcasting.slotLevels
              ? [...rule.spellcasting.slotLevels]
              : undefined,
            cantripsKnown: rule.spellcasting.cantripsKnown
              ? [...rule.spellcasting.cantripsKnown]
              : undefined,
            spellsKnown: rule.spellcasting.spellsKnown
              ? [...rule.spellcasting.spellsKnown]
              : undefined,
          }
        : null,
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
      features: rule.features.map((feature) => ({
        ...feature,
        grants: feature.grants
          ? {
              expertise: feature.grants.expertise
                ? [...feature.grants.expertise]
                : undefined,
              halfProficiencyAbilities: feature.grants.halfProficiencyAbilities
                ? [...feature.grants.halfProficiencyAbilities]
                : undefined,
            }
          : undefined,
      })),
      unarmoredAcAbilities: [...rule.unarmoredAcAbilities],
      startingKit: (rule.startingKit ?? []).map((entry) => ({ ...entry })),
      choices: (rule.choices ?? []).map((choice) => ({
        ...choice,
        levelCounts: choice.levelCounts?.map((entry) => ({ ...entry })),
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
    patch( {
      [field]: { ...selected[field], [ability]: value },
    });
  };

  return (
    <>
    <div className="item-library rules-library">
      <nav className="item-category-tabs" aria-label="Rule categories">
        {RULE_KINDS.map((entry) => (
          <button
            key={entry}
            className={entry === kind ? "is-active" : ""}
            aria-current={entry === kind ? "page" : undefined}
            onClick={() => {
              if (entry === kind) return;
              requestLeave(() => setKind(entry));
            }}
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
        <div className="library-search-row">
          <RamInput
            type="search"
            value={query}
            placeholder="Search rules…"
            aria-label="Search rules library"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="item-catalog-list">
          {visible.map((rule) => (
            <button
              key={rule.id}
              className={rule.id === selected?.id ? "is-selected" : ""}
              onClick={() => selectRule(rule.id)}
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
                    if (confirmDeletes) setDeleteTarget(selected);
                    else {
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
                  onChange={(event) => patch( { name: event.target.value })}
                />
              </RamField>
              {parentOptions.length > 0 && (
                <RamField label={parentKind === "race" ? "Parent Race" : "Parent Class"}>
                  <RamSelect
                    value={selected.parentId ?? ""}
                    onChange={(event) =>
                      patch( { parentId: event.target.value || undefined })
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
              {selected.kind === "subclass" && (
                <RuleNumber
                  label="Minimum Level"
                  value={selected.minLevel ?? 1}
                  onChange={(minLevel) =>
                    patch({ minLevel: Math.max(1, Math.min(20, minLevel || 1)) })
                  }
                />
              )}
              {selected.kind === "class" && (
                <RamField
                  label="Ability Score Improvement Levels"
                  className="span-all"
                  hint="Levels at which this class grants +2 to one ability or +1 to two."
                >
                  <TagInput
                    values={(selected.abilityScoreImprovementLevels ?? []).map(String)}
                    suggestions={[]}
                    ariaLabel="Ability score improvement levels"
                    placeholder="4"
                    onChange={(levels) =>
                      patch({
                        abilityScoreImprovementLevels: [
                          ...new Set(
                            levels
                              .map(Number)
                              .filter((level) => Number.isInteger(level) && level >= 1 && level <= 20)
                          ),
                        ].sort((a, b) => a - b),
                      })
                    }
                  />
                </RamField>
              )}
              <RuleNumber
                label="Flat HP / Level"
                value={selected.hpPerLevel}
                onChange={(hpPerLevel) => patch( { hpPerLevel })}
              />
              <RuleNumber
                label="Hit Die"
                value={selected.hitDie}
                onChange={(hitDie) => patch( { hitDie })}
              />
              <RuleNumber
                label="Extra HP"
                value={selected.extraHp}
                onChange={(extraHp) => patch( { extraHp })}
              />
              <RuleNumber
                label="AC Bonus"
                value={selected.armorBonus}
                onChange={(armorBonus) => patch( { armorBonus })}
              />
              <RuleNumber
                label="Speed"
                value={selected.speed}
                onChange={(speed) => patch( { speed })}
              />
              {(selected.kind === "race" || selected.kind === "subrace") && (
                <>
                  <RamField label="Creature Size">
                    <RamSelect
                      value={selected.creatureSize ?? ""}
                      onChange={(event) =>
                        patch( {
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
                        patch( {
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

            {(selected.spellcasting || selected.resourceTracks.length > 0) && (
              <div className="rule-list-block">
                <div className="rule-list-block__header">
                  <span className="ram-field__label">Progression Reference</span>
                </div>
                <span className="ram-field__hint">
                  Structured reference data for future spell and combat automation.
                </span>
                <div className="calculated-details">
                  {selected.spellcasting && (
                    <>
                      <span>
                        <b>Spellcasting</b>
                        {selected.spellcasting.ability.toUpperCase()} ·{" "}
                        {selected.spellcasting.mode}
                      </span>
                      <span>
                        <b>Slot Table</b>
                        {selected.spellcasting.slotsByLevel
                          .map((slots, index) =>
                            slots.length
                              ? `Lv ${index + 1}: ${slots.join("/")}`
                              : `Lv ${index + 1}: —`
                          )
                          .join(", ")}
                      </span>
                    </>
                  )}
                  {selected.resourceTracks.map((track) => (
                    <span key={track.id}>
                      <b>{track.name}</b>
                      {track.values
                        .map((entry) => `Lv ${entry.level}: ${entry.value} ${track.unit}`)
                        .join(", ")}
                    </span>
                  ))}
                </div>
              </div>
            )}

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
                        patch( {
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
                  onChange={(values) => patch( { [field]: values })}
                />
              </RamField>
            ))}

            <SkillsEditor
              values={selected.skillBonuses}
              onChange={(skillBonuses) => patch( { skillBonuses })}
            />

            <FeaturesEditor
              values={selected.features}
              onChange={(features) => patch( { features })}
            />

            <StartingKitEditor
              values={selected.startingKit ?? []}
              onChange={(startingKit) => patch( { startingKit })}
            />

            <ChoicesEditor
              values={selected.choices ?? []}
              onChange={(choices) => patch( { choices })}
            />

            <RamField label="Notes">
              <RamTextarea
                value={selected.notes}
                onChange={(event) => patch( { notes: event.target.value })}
              />
            </RamField>
          </>
        ) : (
          <div className="token-editor-placeholder">Create a rule to begin.</div>
        )}
      </div>
    </div>
    <RamConfirmDialog
      open={Boolean(deleteTarget)}
      title={`Delete ${deleteTarget?.name ?? "rule"}?`}
      description="This rule and any child rules will be permanently removed."
      confirmLabel="Delete"
      onConfirm={() => {
        if (!deleteTarget) return;
        deleteRule(deleteTarget.id);
        setSelectedId("");
      }}
      onClose={() => setDeleteTarget(undefined)}
    />
    </>
  );
}
