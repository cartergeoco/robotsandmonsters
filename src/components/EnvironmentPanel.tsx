import {
  Copy,
  Hexagon,
  Library,
  Music,
  Pencil,
  Plus,
  Swords,
  Trash2,
  Upload,
  Volume2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useRAM } from "../store";
import { unlockSceneAudio } from "../sceneAudio";
import {
  ABILITY_KEYS,
  ABILITY_LABELS,
  DAMAGE_DICE,
  DAMAGE_TYPES,
  ENVIRONMENT_LIGHTING,
  ENVIRONMENT_LIGHTING_LABELS,
  ENVIRONMENT_WEATHER,
  ENVIRONMENT_WEATHER_LABELS,
  NPC_STANCE_LABELS,
  STATUS_EFFECT_PRESETS,
  defaultStanceForKind,
  normalizeLighting,
  tokenDisplayName,
  type EnvironmentWeather,
  type StatusEffectPresetId,
} from "../types";
import { fileToDataURL } from "../util";
import { AudioTrackRow } from "./ui/AudioTrackRow";
import {
  RamConfirmDialog,
  RamField,
  RamIconButton,
  RamInput,
  RamPanel,
  RamPanelBody,
  RamPanelHeader,
  RamSection,
  RamSelect,
} from "./ui/RamPrimitives";

const HAZARD_STATUSES = STATUS_EFFECT_PRESETS.filter(
  (preset) => preset.kind === "debuff"
);

function SaveAreasSection() {
  const saveAreas = useRAM((s) => s.saveAreas);
  const selectedSaveAreaId = useRAM((s) => s.selectedSaveAreaId);
  const addSaveArea = useRAM((s) => s.addSaveArea);
  const updateSaveArea = useRAM((s) => s.updateSaveArea);
  const deleteSaveArea = useRAM((s) => s.deleteSaveArea);
  const selectSaveArea = useRAM((s) => s.selectSaveArea);
  const selected = saveAreas.find((area) => area.id === selectedSaveAreaId);
  const [deleteTarget, setDeleteTarget] = useState<typeof selected>(undefined);

  return (
    <RamSection
      title="Save areas"
      action={
        <RamIconButton label="Add save area" onClick={() => addSaveArea()}>
          <Plus size={16} strokeWidth={1.5} />
        </RamIconButton>
      }
    >
      <p className="save-area-hint">
        Creatures auto-roll when they enter. A failed save cannot be retried until they
        leave and come back.
      </p>
      <div className="save-area-list">
        {saveAreas.map((area) => (
          <button
            type="button"
            key={area.id}
            className={`save-area-row${area.id === selectedSaveAreaId ? " is-selected" : ""}`}
            onClick={() =>
              selectSaveArea(area.id === selectedSaveAreaId ? null : area.id)
            }
          >
            <span
              className="save-area-swatch"
              style={{ background: area.color }}
              aria-hidden="true"
            />
            <span className="save-area-row__name">{area.name}</span>
            <small>
              {ABILITY_LABELS[area.saveAbility].slice(0, 3)} DC {area.dc}
            </small>
          </button>
        ))}
        {saveAreas.length === 0 && (
          <span className="empty-inline">None on the map</span>
        )}
      </div>
      {selected && (
        <div className="save-area-fields">
          <RamField label="Name">
            <RamInput
              value={selected.name}
              onChange={(event) =>
                updateSaveArea(selected.id, { name: event.target.value })
              }
            />
          </RamField>
          <RamField label="Save">
            <RamSelect
              value={selected.saveAbility}
              onChange={(event) =>
                updateSaveArea(selected.id, {
                  saveAbility: event.target.value as (typeof ABILITY_KEYS)[number],
                })
              }
            >
              {ABILITY_KEYS.map((key) => (
                <option value={key} key={key}>
                  {ABILITY_LABELS[key]}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <RamField label="DC">
            <RamInput
              type="number"
              min={1}
              max={40}
              value={selected.dc}
              onChange={(event) =>
                updateSaveArea(selected.id, { dc: Number(event.target.value) })
              }
            />
          </RamField>
          <RamField label="Damage">
            <span className="save-area-damage">
              <RamInput
                type="number"
                min={0}
                max={20}
                value={selected.damageDiceCount}
                aria-label="Damage dice count"
                onChange={(event) =>
                  updateSaveArea(selected.id, {
                    damageDiceCount: Number(event.target.value),
                  })
                }
              />
              <RamSelect
                value={selected.damageDie}
                aria-label="Damage die"
                onChange={(event) =>
                  updateSaveArea(selected.id, {
                    damageDie: event.target.value as (typeof DAMAGE_DICE)[number],
                  })
                }
              >
                {DAMAGE_DICE.map((die) => (
                  <option value={die} key={die}>
                    {die}
                  </option>
                ))}
              </RamSelect>
            </span>
          </RamField>
          <RamField label="Type">
            <RamSelect
              value={selected.damageType}
              onChange={(event) =>
                updateSaveArea(selected.id, { damageType: event.target.value })
              }
            >
              <option value="">None</option>
              {DAMAGE_TYPES.map((type) => (
                <option value={type} key={type}>
                  {type}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <RamField label="On fail">
            <RamSelect
              value={selected.failStatusId}
              onChange={(event) =>
                updateSaveArea(selected.id, {
                  failStatusId: event.target.value as StatusEffectPresetId | "",
                })
              }
            >
              <option value="">No condition</option>
              {HAZARD_STATUSES.map((preset) => (
                <option value={preset.id} key={preset.id}>
                  {preset.name}
                </option>
              ))}
            </RamSelect>
          </RamField>
          <label className="save-area-half">
            <input
              type="checkbox"
              checked={selected.halfOnSuccess}
              onChange={(event) =>
                updateSaveArea(selected.id, { halfOnSuccess: event.target.checked })
              }
            />
            Half damage on success
          </label>
          <div className="save-area-fields__actions">
            <span>
              <Hexagon size={12} strokeWidth={1.5} /> Click empty map cells to shape
              this area.
            </span>
            <RamIconButton
              label={`Delete ${selected.name}`}
              variant="danger"
              onClick={() => setDeleteTarget(selected)}
            >
              <Trash2 size={14} strokeWidth={1.5} />
            </RamIconButton>
          </div>
        </div>
      )}
      <RamConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "save area"}?`}
        description="This save area will be permanently removed from the map."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteSaveArea(deleteTarget.id);
        }}
        onClose={() => setDeleteTarget(undefined)}
      />
    </RamSection>
  );
}

export function EnvironmentPanel() {
  const tokens = useRAM((s) => s.tokens);
  const background = useRAM((s) => s.background);
  const lighting = useRAM((s) => s.lighting);
  const weather = useRAM((s) => s.weather);
  const music = useRAM((s) => s.music);
  const ambience = useRAM((s) => s.ambience);
  const battleMusic = useRAM((s) => s.battleMusic);
  const environments = useRAM((s) => s.environments);
  const activeEnvironmentId = useRAM((s) => s.activeEnvironmentId);
  const setBackground = useRAM((s) => s.setBackground);
  const setLighting = useRAM((s) => s.setLighting);
  const setWeather = useRAM((s) => s.setWeather);
  const setMusic = useRAM((s) => s.setMusic);
  const setAmbience = useRAM((s) => s.setAmbience);
  const setBattleMusic = useRAM((s) => s.setBattleMusic);
  const applyEnvironment = useRAM((s) => s.applyEnvironment);
  const setTokenManagerOpen = useRAM((s) => s.setTokenManagerOpen);
  const duplicateToken = useRAM((s) => s.duplicateToken);
  const deleteToken = useRAM((s) => s.deleteToken);
  const bgFileRef = useRef<HTMLInputElement>(null);
  const [deleteTarget, setDeleteTarget] = useState<
    { id: string; name: string } | undefined
  >();

  const sortedEnvironments = useMemo(
    () => [...environments].sort((a, b) => a.name.localeCompare(b.name)),
    [environments]
  );
  const groups = [
    { kind: "enemy" as const, title: "Enemies" },
    { kind: "npc" as const, title: "NPCs" },
    { kind: "object" as const, title: "Objects" },
  ];
  const tokensByKind = useMemo(
    () =>
      Object.fromEntries(
        groups.map(({ kind }) => [
          kind,
          tokens
            .filter((token) => token.kind === kind)
            .sort((a, b) => tokenDisplayName(a).localeCompare(tokenDisplayName(b))),
        ])
      ) as Record<(typeof groups)[number]["kind"], typeof tokens>,
    [tokens]
  );

  return (
    <>
    <RamPanel className="env-panel">
      <RamPanelHeader
        title="Environment"
        actions={
          <RamIconButton label="Open token library" onClick={() => setTokenManagerOpen(true)}>
            <Library size={17} strokeWidth={1.5} />
          </RamIconButton>
        }
      />
      <RamPanelBody>
        <div className="env-scene">
          <div className="env-scene__row">
            <RamSelect
              aria-label="Switch environment"
              value={activeEnvironmentId ?? ""}
              onChange={(event) => {
                const id = event.target.value;
                if (!id) return;
                unlockSceneAudio();
                applyEnvironment(id);
              }}
            >
              <option value="" disabled>
                {sortedEnvironments.length ? "Switch scene…" : "No saved scenes"}
              </option>
              {sortedEnvironments.map((environment) => (
                <option value={environment.id} key={environment.id}>
                  {environment.name}
                  {environment.id === activeEnvironmentId ? " (active)" : ""}
                </option>
              ))}
            </RamSelect>
            <RamIconButton
              label="Open environment library"
              onClick={() => setTokenManagerOpen(true, "all", "environments")}
            >
              <Library size={16} strokeWidth={1.5} />
            </RamIconButton>
          </div>

          <div className="env-scene__row">
            <span className="section-actions">
              <RamIconButton label={background ? "Replace map image" : "Upload map image"} onClick={() => bgFileRef.current?.click()}>
                <Upload size={18} strokeWidth={1.5} />
              </RamIconButton>
              {background && (
                <RamIconButton
                  label="Remove map"
                  variant="danger"
                  onClick={() => setBackground(null)}
                >
                  <X size={16} strokeWidth={1.5} />
                </RamIconButton>
              )}
            </span>
          </div>
          <input
            ref={bgFileRef}
            type="file"
            accept="image/*"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setBackground({ src: await fileToDataURL(f), scale: 1 });
              e.target.value = "";
            }}
          />
          {background ? (
            <div className="bg-scale">
              <span className="ram-eyebrow">Map scale</span>
              <input
                type="range"
                min={0.1}
                max={4}
                step={0.05}
                value={background.scale}
                onChange={(e) =>
                  setBackground({ ...background, scale: Number(e.target.value) })
                }
              />
              <span>{background.scale.toFixed(2)}×</span>
            </div>
          ) : (
            <span className="empty-inline">No map loaded</span>
          )}

          <AudioTrackRow
            label="Music"
            icon={Music}
            track={music}
            onChange={setMusic}
            onPick={unlockSceneAudio}
          />
          <AudioTrackRow
            label="Ambience"
            icon={Volume2}
            track={ambience}
            onChange={setAmbience}
            onPick={unlockSceneAudio}
          />
          <AudioTrackRow
            label="Battle"
            icon={Swords}
            track={battleMusic}
            onChange={setBattleMusic}
            onPick={unlockSceneAudio}
          />
        </div>

        <RamSection title="Lighting">
          <div className="env-choice-list" role="listbox" aria-label="Lighting">
            {ENVIRONMENT_LIGHTING.map((value) => (
              <button
                type="button"
                key={value}
                role="option"
                aria-selected={normalizeLighting(lighting) === value}
                className={`env-choice${normalizeLighting(lighting) === value ? " is-selected" : ""}`}
                onClick={() => setLighting(value)}
              >
                {ENVIRONMENT_LIGHTING_LABELS[value]}
              </button>
            ))}
          </div>
        </RamSection>

        <RamSection title="Weather">
          <div className="env-choice-list" role="listbox" aria-label="Weather">
            {ENVIRONMENT_WEATHER.map((value) => (
              <button
                type="button"
                key={value}
                role="option"
                aria-selected={weather === value}
                className={`env-choice${weather === value ? " is-selected" : ""}`}
                onClick={() => {
                  unlockSceneAudio();
                  setWeather(value as EnvironmentWeather);
                }}
              >
                {ENVIRONMENT_WEATHER_LABELS[value]}
              </button>
            ))}
          </div>
        </RamSection>

        <SaveAreasSection />

        <RamSection
          title="Tokens"
          action={
            <RamIconButton label="Browse token library" onClick={() => setTokenManagerOpen(true)}>
              <Library size={16} strokeWidth={1.5} />
            </RamIconButton>
          }
        >
          <div className="env-token-tree">
            {groups.map(({ kind, title }) => {
              const list = tokensByKind[kind];
              return (
                <section className="env-token-group" key={kind}>
                  <div className="env-token-group__heading">
                    <span>{title}</span>
                    <small>{list.length}</small>
                  </div>
                  <div className="token-list">
                    {list.map((token) => (
                      <div
                        className={`token-row token-row--${kind}${
                          token.givenName.trim() ? " is-named" : ""
                        }`}
                        key={token.id}
                      >
                        <button
                          className="token-name"
                          onClick={() => setTokenManagerOpen(true, kind, "map", token.id)}
                        >
                          {tokenDisplayName(token)}
                          {kind !== "object" && (
                            <small className={`token-stance token-stance--${token.stance ?? defaultStanceForKind(kind)}`}>
                              {NPC_STANCE_LABELS[token.stance ?? defaultStanceForKind(kind)]}
                            </small>
                          )}
                        </button>
                        {token.hp !== undefined && (
                          <span className="token-hp">
                            {token.hp}/{token.maxHp}
                          </span>
                        )}
                        <span className="token-row__actions">
                          <RamIconButton
                            label={`Edit ${tokenDisplayName(token)}`}
                            onClick={() => setTokenManagerOpen(true, kind, "map", token.id)}
                          >
                            <Pencil size={13} strokeWidth={1.5} />
                          </RamIconButton>
                          <RamIconButton
                            label={`Duplicate ${tokenDisplayName(token)}`}
                            onClick={() => duplicateToken(token.id)}
                          >
                            <Copy size={13} strokeWidth={1.5} />
                          </RamIconButton>
                          <RamIconButton
                            label={`Delete ${tokenDisplayName(token)}`}
                            variant="danger"
                            onClick={() =>
                              setDeleteTarget({
                                id: token.id,
                                name: tokenDisplayName(token),
                              })
                            }
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                          </RamIconButton>
                        </span>
                      </div>
                    ))}
                    {list.length === 0 && <span className="token-tree-empty">None on map</span>}
                  </div>
                </section>
              );
            })}
          </div>
        </RamSection>
      </RamPanelBody>
    </RamPanel>
    <RamConfirmDialog
      open={Boolean(deleteTarget)}
      title={`Delete ${deleteTarget?.name ?? "token"}?`}
      description="This token will be permanently removed from the map."
      confirmLabel="Delete"
      onConfirm={() => {
        if (!deleteTarget) return;
        deleteToken(deleteTarget.id);
      }}
      onClose={() => setDeleteTarget(undefined)}
    />
    </>
  );
}
