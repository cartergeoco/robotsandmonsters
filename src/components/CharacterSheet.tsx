import { Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useRAM } from "../store";
import type {
  PC,
  StatusEffect,
  Trait,
} from "../types";
import {
  ALIGNMENTS,
  PC_COLORS,
  STATUS_EFFECT_PRESETS,
  activeCreatureRules,
  calculateCreatureStats,
  ruleChoiceCountAtLevel,
  statusEffectColor,
  temporaryHp,
  type StatusEffectPresetId,
} from "../types";
import { deathConditionLabel, deathSaveState } from "../deathSaves";
import { fileToDataURL } from "../util";
import { CharacterCombat } from "./CharacterCombat";
import { CreatureMechanicsEditor } from "./CreatureMechanicsEditor";
import { PortraitField } from "./PortraitField";
import { TokenBoundsEditor } from "./TokenBoundsEditor";
import {
  RamBadge,
  RamConfirmDialog,
  RamField,
  RamIconButton,
  RamInput,
  RamPanel,
  RamPanelBody,
  RamPanelHeader,
  RamSection,
  RamSelect,
  RamStat,
  RamTabs,
  RamTextarea,
} from "./ui/RamPrimitives";

const uid = () => crypto.randomUUID();

function EmptyRow({ children }: { children: ReactNode }) {
  return <p className="sheet-empty-row">{children}</p>;
}

function DescriptionsEditor({
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
          onClick={() => onChange([...values, { id: uid(), name: "", description: "" }])}
        >
          <Plus size={16} />
        </RamIconButton>
      }
    >
      {values.length === 0 && <EmptyRow>No {title.toLowerCase()} yet.</EmptyRow>}
      <div className="ram-list-editor">
        {values.map((value) => (
          <div className="ram-list-row ram-list-row--description" key={value.id}>
            <RamInput
              className="title"
              value={value.name}
              placeholder="Name"
              aria-label={`${singular} name`}
              onChange={(event) =>
                onChange(
                  values.map((item) =>
                    item.id === value.id ? { ...item, name: event.target.value } : item
                  )
                )
              }
            />
            <RamIconButton
              label={`Remove ${value.name || singular}`}
              variant="danger"
              onClick={() => onChange(values.filter((item) => item.id !== value.id))}
            >
              <Trash2 size={16} />
            </RamIconButton>
            <RamInput
              className="grow"
              value={value.description}
              placeholder="Description"
              aria-label={`${value.name || singular} description`}
              onChange={(event) =>
                onChange(
                  values.map((item) =>
                    item.id === value.id
                      ? { ...item, description: event.target.value }
                      : item
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

function StatusEditor({
  statuses,
  onChange,
}: {
  statuses: StatusEffect[];
  onChange: (statuses: StatusEffect[]) => void;
}) {
  const [effectId, setEffectId] = useState<StatusEffectPresetId>(
    STATUS_EFFECT_PRESETS[0].id
  );
  const selectedPreset =
    STATUS_EFFECT_PRESETS.find((preset) => preset.id === effectId) ??
    STATUS_EFFECT_PRESETS[0];

  function addEffect() {
    onChange([
      ...statuses,
      {
        id: uid(),
        effectId: selectedPreset.id,
        name: selectedPreset.name,
        kind: selectedPreset.kind,
        color: selectedPreset.color,
        note: "",
      },
    ]);
  }

  return (
    <RamSection title="Effects">
      <div className="status-effect-picker">
        <span
          className="status-effect-swatch"
          style={{ "--effect-color": selectedPreset.color } as CSSProperties}
          aria-hidden="true"
        />
        <RamSelect
          value={effectId}
          aria-label="Effect to add"
          onChange={(event) => setEffectId(event.target.value as StatusEffectPresetId)}
        >
          <optgroup label="Buffs">
            {STATUS_EFFECT_PRESETS.filter((preset) => preset.kind === "buff").map(
              (preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              )
            )}
          </optgroup>
          <optgroup label="Debuffs">
            {STATUS_EFFECT_PRESETS.filter((preset) => preset.kind === "debuff").map(
              (preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              )
            )}
          </optgroup>
        </RamSelect>
        <RamIconButton
          label={`Add ${selectedPreset.name}`}
          onClick={addEffect}
        >
          <Plus size={16} />
        </RamIconButton>
      </div>
      {statuses.length === 0 && <EmptyRow>No status effects.</EmptyRow>}
      <div className="ram-list-editor">
        {statuses.map((status) => (
          <div className="ram-list-row status-effect-row" key={status.id}>
            <span
              className="status-effect-swatch"
              style={{ "--effect-color": statusEffectColor(status) } as CSSProperties}
              aria-label={`${status.name} color`}
            />
            <RamBadge tone={status.kind === "buff" ? "positive" : "danger"}>
              {status.kind}
            </RamBadge>
            <RamSelect
              className="grow"
              value={status.effectId ?? ""}
              aria-label={`${status.name || "Effect"} effect`}
              onChange={(event) =>
                onChange(statuses.map((item) => {
                  if (item.id !== status.id) return item;
                  const preset = STATUS_EFFECT_PRESETS.find(
                    (entry) => entry.id === event.target.value
                  );
                  return preset
                    ? {
                        ...item,
                        effectId: preset.id,
                        name: preset.name,
                        kind: preset.kind,
                        color: preset.color,
                      }
                    : item;
                }))
              }
            >
              {!status.effectId && <option value="">{status.name || "Legacy effect"}</option>}
              {STATUS_EFFECT_PRESETS.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </RamSelect>
            <RamIconButton
              label={`Remove ${status.name || "effect"}`}
              variant="danger"
              onClick={() => onChange(statuses.filter((item) => item.id !== status.id))}
            >
              <Trash2 size={16} />
            </RamIconButton>
          </div>
        ))}
      </div>
    </RamSection>
  );
}

function sameSheetPc(prev: PC | null, next: PC | null) {
  if (prev === next) return true;
  if (!prev || !next || prev.id !== next.id) return false;
  for (const key of Object.keys(next) as (keyof PC)[]) {
    if (key === "x" || key === "y") continue;
    if (prev[key] !== next[key]) return false;
  }
  return true;
}

function readSelectedPc() {
  const state = useRAM.getState();
  return state.pcs.find((item) => item.id === state.selectedPcId) ?? null;
}

export function CharacterSheet() {
  const [pc, setPc] = useState<PC | null>(readSelectedPc);
  useEffect(() => {
    const apply = (next: PC | null) => {
      setPc((current) => (sameSheetPc(current, next) ? current : next));
    };
    apply(readSelectedPc());
    return useRAM.subscribe((state, prev) => {
      if (state.selectedPcId === prev.selectedPcId && state.pcs === prev.pcs) return;
      apply(readSelectedPc());
    });
  }, []);
  const updatePC = useRAM((state) => state.updatePC);
  const deletePC = useRAM((state) => state.deletePC);
  const selectPC = useRAM((state) => state.selectPC);
  const rules = useRAM((state) => state.ruleDefinitions);
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const confirmDeletes = useRAM((state) => state.uiSettings.confirmDeletes);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [tab, setTab] = useState<"play" | "combat" | "build" | "story" | "token">(
    "play"
  );

  if (!pc) return null;

  const set = (patch: Partial<PC>) => updatePC(pc.id, patch);
  const calculated = calculateCreatureStats(pc, rules, libraryItems);
  const incompleteChoices = activeCreatureRules(pc, rules).reduce((count, rule) => {
    return (
      count +
      (rule.choices ?? [])
        .filter((choice) => (choice.level ?? 1) <= pc.level)
        .reduce((sum, choice) => {
          const need = ruleChoiceCountAtLevel(choice, pc.level);
          const have = (pc.ruleChoices?.[`${rule.id}:${choice.id}`] ?? []).length;
          return sum + Math.max(0, need - have);
        }, 0)
    );
  }, 0);
  const headerMeta = [pc.race, pc.className].filter(Boolean).join(" · ");

  return (
    <>
      <RamPanel className="sheet-drawer">
      <RamPanelHeader
        title={pc.name}
        subtitle={
          headerMeta
            ? `${headerMeta}${pc.level ? ` ${pc.level}` : ""}`
            : undefined
        }
        leading={
          <span className="sheet-avatar" aria-hidden="true">
            {pc.portrait ? (
              <img src={pc.portrait} alt="" />
            ) : (
              pc.name.slice(0, 1).toUpperCase() || "?"
            )}
          </span>
        }
        actions={
          <RamIconButton label="Close character sheet" onClick={() => selectPC(null)}>
            <X size={16} strokeWidth={1.5} />
          </RamIconButton>
        }
      />
      <div className="sheet-summary">
        <RamStat
          label="Hit Points"
          value={pc.hp}
          detail={`/ ${calculated.maxHp}${
            temporaryHp(pc.hp, calculated.maxHp)
              ? ` · ${temporaryHp(pc.hp, calculated.maxHp)} temp`
              : ""
          }${
            deathConditionLabel(pc) ? ` · ${deathConditionLabel(pc)}` : ""
          }`}
          tone={
            deathSaveState(pc).dead || pc.hp <= 0
              ? "danger"
              : temporaryHp(pc.hp, calculated.maxHp) > 0
                ? "brass"
                : pc.hp / Math.max(calculated.maxHp, 1) > 0.3
                  ? "positive"
                  : "danger"
          }
        />
        <RamStat label="Armor" value={calculated.armorClass} tone="brass" />
        <RamStat label="Passive Perception" value={calculated.passivePerception} />
        <RamStat label="Level" value={pc.level} />
      </div>
      <div className="sheet-tabs">
        <RamTabs
          value={tab}
          onChange={(value) => {
            setTab(value as typeof tab);
            bodyRef.current?.scrollTo({ top: 0 });
          }}
          tabs={[
            { value: "play", label: "Play" },
            { value: "combat", label: "Combat" },
            {
              value: "build",
              label: incompleteChoices > 0 ? `Build (${incompleteChoices})` : "Build",
            },
            { value: "story", label: "Story" },
            { value: "token", label: "Token" },
          ]}
        />
      </div>
      <RamPanelBody ref={bodyRef} className="sheet-drawer-body">
        {tab === "play" && (
          <>
            <StatusEditor statuses={pc.statuses} onChange={(statuses) => set({ statuses })} />
            <CreatureMechanicsEditor
              value={pc}
              onChange={(patch) => set(patch)}
              pcMode
              include="play"
            />
          </>
        )}

        {tab === "combat" && <CharacterCombat pc={pc} calculated={calculated} />}

        {tab === "build" && (
          <>
            <RamSection title="Identity">
              <div className="ram-field-grid ram-field-grid--2">
                <RamField label="Name" className="span-all">
                  <RamInput
                    value={pc.name}
                    onChange={(event) => set({ name: event.target.value })}
                    spellCheck={false}
                  />
                </RamField>
                <RamField label="Alignment" className="span-all">
                  <RamSelect
                    value={pc.alignment}
                    onChange={(event) => set({ alignment: event.target.value })}
                  >
                    {ALIGNMENTS.map((alignment) => (
                      <option value={alignment} key={alignment}>
                        {alignment}
                      </option>
                    ))}
                  </RamSelect>
                </RamField>
              </div>
            </RamSection>
            <CreatureMechanicsEditor
              value={pc}
              onChange={(patch) => set(patch)}
              pcMode
              include="build"
            />
          </>
        )}

        {tab === "story" && (
          <>
            <RamSection title="Personality" journal>
              <RamTextarea
                aria-label="Personality"
                className="personality-record"
                value={pc.personality}
                onChange={(event) => set({ personality: event.target.value })}
                placeholder="Voice, habits, fears, and motives…"
              />
            </RamSection>
            <RamSection title="Current Goal" journal>
              <RamTextarea
                aria-label="Current goal"
                className="personality-record"
                value={pc.goal ?? ""}
                onChange={(event) => set({ goal: event.target.value })}
                placeholder="The objective this character is pursuing across turns…"
              />
            </RamSection>
            <RamSection title="Private Knowledge" journal>
              <RamTextarea
                aria-label="Private knowledge"
                className="personality-record"
                value={pc.knowledge ?? ""}
                onChange={(event) => set({ knowledge: event.target.value })}
                placeholder="Secrets, grudges, and hooks only this character knows…"
              />
            </RamSection>
            <DescriptionsEditor
              title="Traits"
              singular="trait"
              values={pc.traits}
              onChange={(traits) => set({ traits })}
            />
            <DescriptionsEditor
              title="Features"
              singular="feature"
              values={pc.features}
              onChange={(features) => set({ features })}
            />
          </>
        )}

        {tab === "token" && (
          <>
            <PortraitField
              name={pc.name}
              portrait={pc.portrait}
              onChange={(portrait) => set({ portrait })}
            />
            <RamSection title="Token">
              <TokenBoundsEditor
                bounds={pc.bounds}
                image={pc.image}
                color={pc.color}
                visualScale={pc.visualScale}
                onChange={(bounds) => {
                  const xs = bounds.map((cell) => cell.x);
                  const ys = bounds.map((cell) => cell.y);
                  set({
                    bounds,
                    width: Math.max(...xs) - Math.min(...xs) + 1,
                    height: Math.max(...ys) - Math.min(...ys) + 1,
                  });
                }}
                onScaleChange={(visualScale) => set({ visualScale })}
              />
              <div className="token-customizer">
                <div className="token-preview" style={{ color: pc.color }}>
                  {pc.image && <img src={pc.image} alt="" />}
                </div>
                <div className="color-swatches">
                  {PC_COLORS.map((color) => (
                    <button
                      key={color}
                      className={`color-swatch${pc.color === color ? " is-active" : ""}`}
                      style={{ "--swatch": color } as CSSProperties}
                      onClick={() => set({ color })}
                      aria-label={`Use token color ${color}`}
                      aria-pressed={pc.color === color}
                    />
                  ))}
                </div>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) set({ image: await fileToDataURL(file) });
                  event.target.value = "";
                }}
              />
              <div className="token-actions">
                <RamIconButton
                  label={pc.image ? "Replace token image" : "Upload token image"}
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload size={18} strokeWidth={1.5} />
                </RamIconButton>
                {pc.image && (
                  <RamIconButton label="Remove token image" onClick={() => set({ image: undefined })}>
                    <X size={16} strokeWidth={1.5} />
                  </RamIconButton>
                )}
              </div>
            </RamSection>
            <div className="sheet-footer">
              <RamIconButton
                label="Delete character"
                variant="danger"
                onClick={() =>
                  confirmDeletes ? setConfirmDeleteOpen(true) : deletePC(pc.id)
                }
              >
                <Trash2 size={18} strokeWidth={1.5} />
              </RamIconButton>
            </div>
          </>
        )}
      </RamPanelBody>
      </RamPanel>
      <RamConfirmDialog
        open={confirmDeleteOpen}
        title={`Delete ${pc.name}?`}
        description="This character and its map token will be permanently removed."
        confirmLabel="Delete"
        onConfirm={() => deletePC(pc.id)}
        onClose={() => setConfirmDeleteOpen(false)}
      />
    </>
  );
}
