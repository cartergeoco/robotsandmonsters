import {
  Copy,
  ImagePlus,
  MapPinPlus,
  Music,
  Plus,
  Swords,
  Trash2,
  Volume2,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useRAM } from "../store";
import { flushCampaignWrites } from "../persistStorage";
import { useLibraryDraft } from "../useLibraryDraft";
import { useLibraryUnsaved, useRegisterUnsaved } from "../libraryUnsaved";
import {
  BUILT_IN_TOKEN_BLUEPRINTS,
} from "../tokenCatalog";
import {
  ENVIRONMENT_LIGHTING,
  ENVIRONMENT_LIGHTING_LABELS,
  ENVIRONMENT_WEATHER,
  ENVIRONMENT_WEATHER_LABELS,
  cloneEnvironmentTrack,
  cloneStatBlock,
  normalizeLighting,
  normalizeWeather,
  tokenDisplayName,
  type Environment,
  type EnvironmentLighting,
  type EnvironmentTrack,
  type EnvironmentWeather,
  type MapToken,
  type TokenBlueprint,
  type TokenKind,
} from "../types";
import { fileToDataURL } from "../util";
import { unlockSceneAudio } from "../sceneAudio";
import { AudioTrackRow } from "./ui/AudioTrackRow";
import {
  RamButton,
  RamConfirmDialog,
  RamField,
  RamIconButton,
  RamInput,
  RamSelect,
  RamTextarea,
} from "./ui/RamPrimitives";

const createId = () => crypto.randomUUID();


function blankEnvironment(): Environment {
  return {
    id: createId(),
    name: "New Environment",
    notes: "",
    lighting: "noon",
    weather: "clear",
    background: null,
    music: null,
    ambience: null,
    battleMusic: null,
    tokens: [],
    saveAreas: [],
  };
}

function tokenFromBlueprint(blueprint: TokenBlueprint, existing: MapToken[]): MapToken {
  const kind = blueprint.kind;
  const count = existing.filter((token) => token.kind === kind).length;
  const { source: _source, ...blueprintValue } = blueprint;
  void _source;
  return {
    ...blueprintValue,
    id: createId(),
    blueprintId: blueprint.id,
    givenName: "",
    stance: blueprint.stance ?? (kind === "enemy" ? "hostile" : "friendly"),
    visualScale: blueprint.visualScale ?? 1,
    hidden: false,
    stealthTotal: null,
    hp: blueprint.maxHp,
    skills: blueprint.skills.map((skill) => ({ ...skill, id: createId() })),
    traits: blueprint.traits.map((trait) => ({ ...trait, id: createId() })),
    features: blueprint.features.map((feature) => ({ ...feature, id: createId() })),
    statuses: blueprint.statuses.map((status) => ({ ...status, id: createId() })),
    ruleChoices: Object.fromEntries(
      Object.entries(blueprint.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
    ),
    abilityImprovements: (blueprint.abilityImprovements ?? []).map((improvement) => ({
      ...improvement,
      increases: { ...improvement.increases },
    })),
    inventory: blueprint.inventory.map((item) => ({ ...item, id: createId() })),
    wallet: { ...blueprint.wallet },
    statBlock: blueprint.statBlock ? cloneStatBlock(blueprint.statBlock) : null,
    bounds: blueprint.bounds.map((cell) => ({ ...cell })),
    x: count * 2 + 1,
    y: kind === "enemy" ? -3 : 2,
  };
}

const TOKEN_GROUPS: { kind: TokenKind; title: string }[] = [
  { kind: "npc", title: "NPCs" },
  { kind: "object", title: "Objects" },
  { kind: "enemy", title: "Enemies" },
];

export function EnvironmentLibrary() {
  const environments = useRAM((state) => state.environments);
  const tokens = useRAM((state) => state.tokens);
  const activeEnvironmentId = useRAM((state) => state.activeEnvironmentId);
  const customBlueprints = useRAM((state) => state.customTokenBlueprints);
  const addEnvironment = useRAM((state) => state.addEnvironment);
  const updateEnvironment = useRAM((state) => state.updateEnvironment);
  const deleteEnvironment = useRAM((state) => state.deleteEnvironment);
  const applyEnvironment = useRAM((state) => state.applyEnvironment);
  const captureEnvironment = useRAM((state) => state.captureEnvironment);
  const confirmDeletes = useRAM((state) => state.uiSettings.confirmDeletes);
  const [selectedId, setSelectedId] = useState("");
  const [query, setQuery] = useState("");
  const [applyTarget, setApplyTarget] = useState<Environment | undefined>();
  const [deleteTarget, setDeleteTarget] = useState<Environment | undefined>();
  const [tokenDeleteTarget, setTokenDeleteTarget] = useState<
    { id: string; name: string } | undefined
  >();
  const [addKind, setAddKind] = useState<TokenKind>("npc");
  const [addBlueprintId, setAddBlueprintId] = useState("");
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const sorted = useMemo(
    () => {
      const needle = query.trim().toLocaleLowerCase();
      return environments
        .filter(
          (environment) =>
            !needle ||
            environment.name.toLocaleLowerCase().includes(needle) ||
            environment.notes.toLocaleLowerCase().includes(needle)
        )
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    [environments, query]
  );
  const stored = environments.find((entry) => entry.id === selectedId) ?? sorted[0];
  const { draft: selected, dirty, patch, save, discard } = useLibraryDraft(stored, (value) => {
    updateEnvironment(value.id, value);
    flushCampaignWrites();
  });
  useRegisterUnsaved(dirty, save, discard);
  const { requestLeave } = useLibraryUnsaved();
  const blueprints = useMemo(
    () =>
      [...BUILT_IN_TOKEN_BLUEPRINTS, ...customBlueprints].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [customBlueprints]
  );
  const addable = blueprints.filter((blueprint) => blueprint.kind === addKind);
  const selectedAdd =
    addable.find((blueprint) => blueprint.id === addBlueprintId) ?? addable[0];

  function create() {
    requestLeave(() => {
      const environment = blankEnvironment();
      addEnvironment(environment);
      setSelectedId(environment.id);
      setStatus("Created a blank environment.");
    });
  }

  function duplicate(environment: Environment) {
    const copy: Environment = {
      ...environment,
      id: createId(),
      name: `${environment.name} Copy`,
      background: environment.background ? { ...environment.background } : null,
      music: cloneEnvironmentTrack(environment.music),
      ambience: cloneEnvironmentTrack(environment.ambience),
      battleMusic: cloneEnvironmentTrack(environment.battleMusic),
      tokens: environment.tokens.map((token) => ({
        ...token,
        id: createId(),
        skills: token.skills.map((skill) => ({ ...skill, id: createId() })),
        traits: token.traits.map((trait) => ({ ...trait, id: createId() })),
        features: token.features.map((feature) => ({ ...feature, id: createId() })),
        statuses: token.statuses.map((status) => ({ ...status, id: createId() })),
        inventory: token.inventory.map((item) => ({ ...item, id: createId() })),
        wallet: { ...token.wallet },
        statBlock: token.statBlock ? cloneStatBlock(token.statBlock) : null,
        bounds: token.bounds.map((cell) => ({ ...cell })),
      })),
    };
    addEnvironment(copy);
    setSelectedId(copy.id);
    setStatus(`Duplicated ${environment.name}.`);
  }

  function requestApply(environment: Environment) {
    if (tokens.length > 0) {
      setApplyTarget(environment);
      return;
    }
    unlockSceneAudio();
    applyEnvironment(environment.id);
    setStatus(`Applied ${environment.name}. Characters stayed in place.`);
  }

  function patchTrack(
    field: "music" | "ambience" | "battleMusic",
    track: EnvironmentTrack | null
  ) {
    if (!selected) return;
    patch({ [field]: track });
  }

  function addStoredToken() {
    if (!selected || !selectedAdd) return;
    patch( {
      tokens: [...selected.tokens, tokenFromBlueprint(selectedAdd, selected.tokens)],
    });
    setStatus(`Added ${selectedAdd.name} to ${selected.name}.`);
  }

  return (
    <div className="environment-library">
      <div className="environment-catalog">
        <div className="library-column-header">
          <span>Environments</span>
          <RamIconButton label="Create environment" onClick={create}>
            <Plus size={17} strokeWidth={1.5} />
          </RamIconButton>
        </div>
        <div className="library-search-row">
          <RamInput
            type="search"
            value={query}
            placeholder="Search environments…"
            aria-label="Search environments"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="item-catalog-list">
          {sorted.map((environment) => (
            <button
              key={environment.id}
              className={environment.id === selected?.id ? "is-selected" : ""}
              onClick={() => {
                if (environment.id === selected?.id) return;
                requestLeave(() => setSelectedId(environment.id));
              }}
            >
              <span>{environment.name}</span>
              <small>
                {ENVIRONMENT_LIGHTING_LABELS[normalizeLighting(environment.lighting)]}
                {" · "}
                {ENVIRONMENT_WEATHER_LABELS[normalizeWeather(environment.weather)]}
                {environment.id === activeEnvironmentId ? " · Active" : ""}
              </small>
            </button>
          ))}
          {sorted.length === 0 && (
            <span className="token-catalog-empty">No saved environments.</span>
          )}
        </div>
      </div>

      <div className="environment-editor">
        {selected ? (
          <>
            <div className="token-editor-header">
              <span className="ram-eyebrow">
                {selected.id === activeEnvironmentId ? "Active environment" : "Saved scene"}
              </span>
              <span className="token-editor-header__actions">
                <RamIconButton
                  label={`Apply ${selected.name} to the map`}
                  variant="brass"
                  onClick={() => requestApply(selected)}
                >
                  <MapPinPlus size={17} strokeWidth={1.5} />
                </RamIconButton>
                <RamIconButton
                  label={`Duplicate ${selected.name}`}
                  onClick={() => duplicate(selected)}
                >
                  <Copy size={16} strokeWidth={1.5} />
                </RamIconButton>
                <RamIconButton
                  label={`Delete ${selected.name}`}
                  variant="danger"
                  onClick={() => {
                    if (confirmDeletes) setDeleteTarget(selected);
                    else {
                      deleteEnvironment(selected.id);
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
                  onChange={(event) =>
                    patch( { name: event.target.value })
                  }
                />
              </RamField>
              <RamField label="Lighting">
                <RamSelect
                  value={normalizeLighting(selected.lighting)}
                  onChange={(event) =>
                    patch( {
                      lighting: event.target.value as EnvironmentLighting,
                    })
                  }
                >
                  {ENVIRONMENT_LIGHTING.map((lighting) => (
                    <option value={lighting} key={lighting}>
                      {ENVIRONMENT_LIGHTING_LABELS[lighting]}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
              <RamField label="Weather">
                <RamSelect
                  value={normalizeWeather(selected.weather)}
                  onChange={(event) =>
                    patch( {
                      weather: event.target.value as EnvironmentWeather,
                    })
                  }
                >
                  {ENVIRONMENT_WEATHER.map((weather) => (
                    <option value={weather} key={weather}>
                      {ENVIRONMENT_WEATHER_LABELS[weather]}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
              <RamField label="Map scale">
                <RamInput
                  type="number"
                  min={0.1}
                  max={4}
                  step={0.05}
                  disabled={!selected.background}
                  value={selected.background?.scale ?? 1}
                  onChange={(event) =>
                    selected.background &&
                    patch( {
                      background: {
                        ...selected.background,
                        scale: Number(event.target.value),
                      },
                    })
                  }
                />
              </RamField>
              <RamField label="Notes" className="span-all">
                <RamTextarea
                  value={selected.notes}
                  onChange={(event) =>
                    patch( { notes: event.target.value })
                  }
                  placeholder="Time of day, weather, or what this place is for…"
                />
              </RamField>
              <AudioTrackRow
                label="Music"
                icon={Music}
                variant="field"
                track={selected.music}
                onChange={(track) => patchTrack("music", track)}
                onPick={unlockSceneAudio}
              />
              <AudioTrackRow
                label="Ambience"
                icon={Volume2}
                variant="field"
                track={selected.ambience}
                onChange={(track) => patchTrack("ambience", track)}
                onPick={unlockSceneAudio}
              />
              <AudioTrackRow
                label="Battle"
                icon={Swords}
                variant="field"
                hint="Replaces this scene's music once initiative is rolled."
                track={selected.battleMusic}
                onChange={(track) => patchTrack("battleMusic", track)}
                onPick={unlockSceneAudio}
              />
            </div>

            <div className="environment-map-row">
              <div className={`environment-map-preview${selected.background ? " has-image" : ""}`}>
                {selected.background ? (
                  <img src={selected.background.src} alt={`${selected.name} map`} />
                ) : (
                  <span>No map</span>
                )}
              </div>
              <div className="environment-map-actions">
                <RamIconButton
                  label={selected.background ? "Replace map image" : "Upload map image"}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={17} strokeWidth={1.5} />
                </RamIconButton>
                {selected.background && (
                  <RamIconButton
                    label="Remove map image"
                    variant="danger"
                    onClick={() => patch( { background: null })}
                  >
                    <X size={15} strokeWidth={1.5} />
                  </RamIconButton>
                )}
                <RamButton
                  size="sm"
                  onClick={() => {
                    captureEnvironment(selected.id);
                    setStatus(`Captured the current map into ${selected.name}.`);
                  }}
                >
                  Capture current scene
                </RamButton>
                <small>Characters are never stored or moved by environments. Paint save areas on the map, then Capture.</small>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    patch( {
                      background: { src: await fileToDataURL(file), scale: 1 },
                    });
                  }
                  event.target.value = "";
                }}
              />
            </div>

            <div className="environment-add-row">
              <RamField label="Add token">
                <RamSelect
                  value={addKind}
                  onChange={(event) => {
                    setAddKind(event.target.value as TokenKind);
                    setAddBlueprintId("");
                  }}
                >
                  <option value="npc">NPC</option>
                  <option value="object">Object</option>
                  <option value="enemy">Enemy</option>
                </RamSelect>
              </RamField>
              <RamField label="From library">
                <RamSelect
                  value={selectedAdd?.id ?? ""}
                  onChange={(event) => setAddBlueprintId(event.target.value)}
                >
                  {addable.map((blueprint) => (
                    <option value={blueprint.id} key={blueprint.id}>
                      {blueprint.name}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
              <RamIconButton
                label="Add token to this environment"
                disabled={!selectedAdd}
                onClick={addStoredToken}
              >
                <Plus size={16} strokeWidth={1.5} />
              </RamIconButton>
            </div>

            <div className="env-token-tree">
              {TOKEN_GROUPS.map(({ kind, title }) => {
                const list = selected.tokens
                  .filter((token) => token.kind === kind)
                  .sort((a, b) => tokenDisplayName(a).localeCompare(tokenDisplayName(b)));
                return (
                  <section className="env-token-group" key={kind}>
                    <div className="env-token-group__heading">
                      <span>{title}</span>
                      <small>{list.length}</small>
                    </div>
                    <div className="token-list">
                      {list.map((token) => (
                        <div className={`token-row token-row--${kind}`} key={token.id}>
                          <span className="token-name">{tokenDisplayName(token)}</span>
                          <span className="token-row__actions">
                            <RamIconButton
                              label={`Remove ${tokenDisplayName(token)}`}
                              variant="danger"
                              onClick={() => {
                                if (confirmDeletes) {
                                  setTokenDeleteTarget({
                                    id: token.id,
                                    name: tokenDisplayName(token),
                                  });
                                } else {
                                  patch( {
                                    tokens: selected.tokens.filter(
                                      (entry) => entry.id !== token.id
                                    ),
                                  });
                                }
                              }}
                            >
                              <Trash2 size={13} strokeWidth={1.5} />
                            </RamIconButton>
                          </span>
                        </div>
                      ))}
                      {list.length === 0 && <span className="token-tree-empty">None stored</span>}
                    </div>
                  </section>
                );
              })}
            </div>
            <span className="token-manager-status" aria-live="polite">
              {status}
            </span>
          </>
        ) : (
          <div className="token-editor-placeholder">
            Create an environment to save lighting, a map, and the NPCs, objects, and enemies in it.
          </div>
        )}
      </div>

      <RamConfirmDialog
        open={Boolean(applyTarget)}
        title={`Apply ${applyTarget?.name ?? "environment"}?`}
        description="The current map, lighting, audio, enemies, NPCs, and objects will fade into this scene. Characters stay where they are."
        confirmLabel="Apply"
        onConfirm={() => {
          if (!applyTarget) return;
          unlockSceneAudio();
          applyEnvironment(applyTarget.id);
          setStatus(`Applied ${applyTarget.name}. Characters stayed in place.`);
        }}
        onClose={() => setApplyTarget(undefined)}
      />
      <RamConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "environment"}?`}
        description="This saved environment will be permanently removed. The current map will not change."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          deleteEnvironment(deleteTarget.id);
          setSelectedId("");
        }}
        onClose={() => setDeleteTarget(undefined)}
      />
      <RamConfirmDialog
        open={Boolean(tokenDeleteTarget)}
        title={`Delete ${tokenDeleteTarget?.name ?? "token"}?`}
        description="This token will be permanently removed from the saved environment."
        confirmLabel="Delete"
        onConfirm={() => {
          if (!selected || !tokenDeleteTarget) return;
          patch( {
            tokens: selected.tokens.filter((entry) => entry.id !== tokenDeleteTarget.id),
          });
        }}
        onClose={() => setTokenDeleteTarget(undefined)}
      />
    </div>
  );
}
