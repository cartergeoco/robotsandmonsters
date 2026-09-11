import { RotateCcw, Save, Swords } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { listProviderModels, testAIConnection, testAITools } from "../ai";
import { buildPCPrompt, estimateTokens, type PCPrompt } from "../aiContext";
import {
  AI_PROVIDER_GROUPS,
  omitTemperature,
  providerSpec,
  providersInGroup,
  switchAIProvider,
  normalizeAISettings,
} from "../aiProviders";
import { consumePendingSettingsTab, OPEN_SHORTCUTS_EVENT, SHORTCUTS } from "../shortcuts";
import { flushCampaignWrites } from "../persistStorage";
import { useRAM } from "../store";
import { estimateToolSchemaTokens, PC_TOOLS } from "../pcTools";
import {
  AI_REASONING_EFFORTS,
  DEFAULT_AI_SETTINGS,
  DEFAULT_GAMEPLAY_SETTINGS,
  DEFAULT_UI_SETTINGS,
  PALETTE_GROUPS,
  PALETTE_LABELS,
  PALETTE_SCHEME,
  AUTOSAVE_EVERY_OPTIONS,
  normalizeGameplaySettings,
  normalizeUISettings,
  type AIProvider,
  type AIReasoningEffort,
  type AISettings,
  type CombatRules,
  type GameplaySettings,
  type ToolAutonomy,
  type UISettings,
} from "../types";
import { unlockSceneAudio } from "../sceneAudio";
import { AudioTrackRow } from "./ui/AudioTrackRow";
import {
  RamButton,
  RamDialog,
  RamField,
  RamIconButton,
  RamInput,
  RamSelect,
  RamTabs,
  RamTextarea,
  RamUnsavedDialog,
} from "./ui/RamPrimitives";

type SettingsTab =
  | "ai"
  | "gameplay"
  | "appearance"
  | "accessibility"
  | "console"
  | "about";

function SettingToggle({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setting-toggle">
      <span className="setting-toggle__copy">
        <span>{title}</span>
        <small>{description}</small>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="setting-switch" aria-hidden="true" />
    </label>
  );
}

function applyUiDocument(ui: UISettings) {
  const root = document.documentElement;
  delete root.dataset.theme;
  root.dataset.palette = ui.palette;
  root.dataset.textScale = ui.textScale;
  root.dataset.density = ui.density;
  root.dataset.motion = ui.motion;
  root.dataset.transparency = ui.reducedTransparency ? "reduced" : "standard";
  root.dataset.contrast = ui.increasedContrast ? "increased" : "standard";
  root.dataset.focus = ui.enhancedFocus ? "enhanced" : "standard";
  root.style.colorScheme = PALETTE_SCHEME[ui.palette] ?? "dark";
}

function AISettingsPanel({
  settings,
  setSettings,
}: {
  settings: AISettings;
  setSettings: (patch: Partial<AISettings>) => void;
}) {
  const spec = providerSpec(settings.provider);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"test" | "tools" | "models" | null>(null);
  const [customModel, setCustomModel] = useState(false);
  const pcs = useRAM((s) => s.pcs);
  const [previewPcId, setPreviewPcId] = useState("");
  const [preview, setPreview] = useState<PCPrompt | null>(null);

  const modelOptions = useMemo(() => {
    const fromCatalog = spec.models.map((entry) => entry.id);
    return [...new Set([...fromCatalog, ...remoteModels])];
  }, [spec, remoteModels]);
  const usingCustomModel =
    customModel || (Boolean(settings.model) && !modelOptions.includes(settings.model));
  const hideTemperature = omitTemperature(settings.model, spec.apiKind);
  const showReasoning =
    spec.showReasoning &&
    (spec.apiKind === "openai-responses" || hideTemperature);
  const showApiKey = spec.keyRequired || spec.id === "custom";

  async function runTest() {
    setBusy("test");
    setStatus("");
    try {
      setStatus(await testAIConnection(settings));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function refreshModels() {
    setBusy("models");
    setStatus("");
    try {
      const models = await listProviderModels(settings);
      setRemoteModels(models);
      setStatus(
        models.length
          ? `Loaded ${models.length} model${models.length === 1 ? "" : "s"} from ${spec.label}.`
          : `${spec.label} returned no models.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  async function runToolTest() {
    setBusy("tools");
    setStatus("");
    try {
      setStatus(await testAITools(settings));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <div className="settings-tab-actions">
        <RamIconButton
          label="Reset AI settings"
          onClick={() =>
            setSettings({
              ...DEFAULT_AI_SETTINGS,
              apiKey: settings.apiKey,
              savedKeys: settings.savedKeys,
              savedModels: settings.savedModels,
              savedBaseUrls: settings.savedBaseUrls,
              azureDeployment: settings.azureDeployment,
              azureApiVersion: settings.azureApiVersion,
              provider: settings.provider,
              baseUrl: settings.baseUrl,
              model: settings.model,
            })
          }
        >
          <RotateCcw size={16} strokeWidth={1.5} />
        </RamIconButton>
      </div>
      <div className="settings-fields">
        <RamField label="Provider" className="span-all">
          <RamSelect
            value={settings.provider}
            onChange={(event) => {
              const next = event.target.value as AIProvider;
              setRemoteModels([]);
              setCustomModel(false);
              setStatus("");
              setSettings(switchAIProvider(settings, next));
            }}
          >
            {AI_PROVIDER_GROUPS.map((group) => (
              <optgroup label={group} key={group}>
                {providersInGroup(group).map((entry) => (
                  <option value={entry.id} key={entry.id}>
                    {entry.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </RamSelect>
        </RamField>

        {showApiKey && (
        <RamField
          label="API Key"
          className={spec.showBaseUrl ? "" : "span-all"}
          hint={spec.keyRequired ? undefined : "Optional Bearer token"}
        >
          <RamInput
            type="password"
            value={settings.apiKey}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => setSettings({ apiKey: event.target.value })}
            placeholder={spec.keyPlaceholder}
          />
        </RamField>
        )}

        {spec.showBaseUrl && (
          <RamField
            label={spec.id === "azure" ? "Resource endpoint" : "Base URL"}
            className={showApiKey ? "" : "span-all"}
            hint={
              spec.id === "azure"
                ? "https://YOUR-RESOURCE.openai.azure.com"
                : spec.id === "ollama"
                  ? "Local Ollama, usually http://localhost:11434"
                  : "Must include /v1 for OpenAI-compatible servers"
            }
          >
            <RamInput
              value={settings.baseUrl}
              spellCheck={false}
              onChange={(event) => setSettings({ baseUrl: event.target.value })}
              placeholder={spec.defaultBaseUrl}
            />
          </RamField>
        )}

        {spec.showAzure && (
          <>
            <RamField label="Deployment name">
              <RamInput
                value={settings.azureDeployment}
                spellCheck={false}
                onChange={(event) =>
                  setSettings({ azureDeployment: event.target.value })
                }
                placeholder="my-gpt-deployment"
              />
            </RamField>
            <RamField
              label="Deployed model ID"
              hint="The underlying model, not the deployment alias. This selects the correct Azure token parameters."
            >
              <RamInput
                value={settings.model}
                spellCheck={false}
                onChange={(event) => setSettings({ model: event.target.value })}
                placeholder="gpt-4o or gpt-5"
              />
            </RamField>
            <RamField label="API version">
              <RamInput
                value={settings.azureApiVersion}
                spellCheck={false}
                onChange={(event) =>
                  setSettings({ azureApiVersion: event.target.value })
                }
                placeholder="2024-10-21"
              />
            </RamField>
          </>
        )}

        {!spec.showAzure && (
        <RamField
          label="Model"
          className="span-all"
          hint={
            spec.canListModels
              ? "Refresh list pulls IDs this key can actually use."
              : "You can still type a custom model ID."
          }
        >
          <div className="settings-model-row">
            {usingCustomModel || modelOptions.length === 0 ? (
              <RamInput
                value={settings.model}
                spellCheck={false}
                onChange={(event) => setSettings({ model: event.target.value })}
                placeholder={spec.defaultModel || "model-id"}
              />
            ) : (
              <RamSelect
                value={settings.model}
                onChange={(event) => {
                  if (event.target.value === "__custom__") {
                    setCustomModel(true);
                    return;
                  }
                  setSettings({ model: event.target.value });
                }}
              >
                {modelOptions.map((id) => {
                  const label = spec.models.find((entry) => entry.id === id)?.label ?? id;
                  return (
                    <option value={id} key={id}>
                      {label}
                    </option>
                  );
                })}
                <option value="__custom__">Custom model ID…</option>
              </RamSelect>
            )}
            {spec.canListModels && (
              <RamButton
                size="sm"
                disabled={busy !== null}
                onClick={() => void refreshModels()}
              >
                {busy === "models" ? "Loading" : "Refresh list"}
              </RamButton>
            )}
            {usingCustomModel && modelOptions.length > 0 && (
              <RamButton
                size="sm"
                onClick={() => {
                  setCustomModel(false);
                  if (!modelOptions.includes(settings.model)) {
                    setSettings({ model: spec.defaultModel || modelOptions[0] });
                  }
                }}
              >
                Catalog
              </RamButton>
            )}
          </div>
        </RamField>
        )}

        {!hideTemperature && (
        <RamField
          label="Creativity"
          hint="0 is literal, 1 is typical roleplay, 2 is chaotic. Some reasoning models ignore this."
        >
          <RamInput
            type="number"
            min={0}
            max={2}
            step={0.05}
            value={settings.temperature}
            onChange={(event) =>
              setSettings({
                temperature: Number(event.target.value),
              })
            }
          />
        </RamField>
        )}
        <RamField
          label="Max reply tokens"
          hint="Hard cap for one character reply. Leave headroom if reasoning is on."
        >
          <RamInput
            type="number"
            min={64}
            max={8192}
            step={16}
            value={settings.maxTokens}
            onChange={(event) =>
              setSettings({
                maxTokens: Number(event.target.value),
              })
            }
          />
        </RamField>
        <RamField
          label="Console lines in full"
          hint="Recent messages sent word for word. Older ones become session memory. 12-20 keeps characters sharp."
        >
          <RamInput
            type="number"
            min={4}
            max={200}
            value={settings.contextWindow}
            onChange={(event) =>
              setSettings({
                contextWindow: Number(event.target.value),
              })
            }
          />
        </RamField>
        <RamField
          label="Scene awareness"
          hint="How far a character notices tokens on the map, in feet. Anything past it is only a distant shape."
        >
          <RamInput
            type="number"
            min={5}
            max={300}
            step={5}
            value={settings.perceptionRadius}
            onChange={(event) =>
              setSettings({
                perceptionRadius: Number(event.target.value),
              })
            }
          />
        </RamField>
        <RamField
          label="Rule lookup budget"
          hint="Token ceiling for rules, items, and lore pulled in because the moment mentions them. 0 turns lookups off."
        >
          <RamInput
            type="number"
            min={0}
            max={4000}
            step={50}
            value={settings.loreBudget}
            onChange={(event) =>
              setSettings({
                loreBudget: Number(event.target.value),
              })
            }
          />
        </RamField>
        <RamField
          label="Memory notes"
          hint="Most bullets kept in the running session digest."
        >
          <RamInput
            type="number"
            min={4}
            max={24}
            value={settings.memoryBullets}
            onChange={(event) =>
              setSettings({
                memoryBullets: Number(event.target.value),
              })
            }
          />
        </RamField>
        <div className="span-all">
          <SettingToggle
            title="Session memory"
            description="Condense older console history into notes every character receives, so the campaign is not forgotten when lines leave the window."
            checked={settings.memoryEnabled}
            onChange={(memoryEnabled) => setSettings({ memoryEnabled })}
          />
        </div>
        {showReasoning && (
          <RamField
            label="Reasoning effort"
            hint="How hard the model thinks before speaking. Higher is slower and costlier."
          >
            <RamSelect
              value={settings.reasoningEffort}
              onChange={(event) =>
                setSettings({
                  reasoningEffort: event.target.value as AIReasoningEffort,
                })
              }
            >
              {AI_REASONING_EFFORTS.map((effort) => (
                <option value={effort} key={effort}>
                  {effort === "none"
                    ? "Off"
                    : effort === "xhigh"
                      ? "Extra high"
                      : effort[0].toUpperCase() + effort.slice(1)}
                </option>
              ))}
            </RamSelect>
          </RamField>
        )}

        <RamField
          label="Extra GM instructions"
          className="span-all"
          hint="Always included in the character prompt. Table tone, secrets the PC already knows, house rules."
        >
          <RamTextarea
            rows={3}
            value={settings.extraInstructions}
            onChange={(event) =>
              setSettings({ extraInstructions: event.target.value })
            }
            placeholder="Tone, table rules, or facts every character should already know…"
          />
        </RamField>

        {!spec.showBaseUrl && (
          <details className="settings-ai-advanced span-all">
            <summary>Advanced</summary>
            <RamField
              label="Base URL"
              hint="Leave the default unless you use a proxy, LiteLLM, or Azure-compatible gateway."
            >
              <RamInput
                value={settings.baseUrl}
                spellCheck={false}
                onChange={(event) => setSettings({ baseUrl: event.target.value })}
                placeholder={spec.defaultBaseUrl}
              />
            </RamField>
          </details>
        )}
      </div>

      <div className="settings-ai-actions">
        <RamButton size="sm" disabled={busy !== null} onClick={() => void runTest()}>
          {busy === "test" ? "Testing" : "Test connection"}
        </RamButton>
        <RamButton size="sm" disabled={busy !== null} onClick={() => void runToolTest()}>
          {busy === "tools" ? "Testing tools" : "Test tools"}
        </RamButton>
        {status && <p className="settings-ai-status">{status}</p>}
      </div>
      <div className="ai-preview-tools">
        <RamField
          label="Preview character context"
          hint="Inspect exactly what RAM would send before using provider tokens."
        >
          <div className="settings-model-row">
            <RamSelect
              value={previewPcId || pcs[0]?.id || ""}
              disabled={pcs.length === 0}
              onChange={(event) => {
                setPreviewPcId(event.target.value);
                setPreview(null);
              }}
            >
              {pcs.map((pc) => (
                <option value={pc.id} key={pc.id}>{pc.name}</option>
              ))}
            </RamSelect>
            <RamButton
              size="sm"
              disabled={pcs.length === 0}
              onClick={() => {
                const state = useRAM.getState();
                const pc = state.pcs.find(
                  (entry) => entry.id === (previewPcId || state.pcs[0]?.id)
                );
                if (!pc) return;
                setPreview(
                  buildPCPrompt({
                    pc,
                    party: state.pcs,
                    log: state.log,
                    settings: state.settings,
                    rules: state.ruleDefinitions,
                    libraryItems: state.customLibraryItems,
                    tokens: state.tokens,
                    lighting: state.lighting,
                    weather: state.weather,
                    environments: state.environments,
                    activeEnvironmentId: state.activeEnvironmentId,
                    memory: state.memory,
                    useSheetTools: state.gameplaySettings.toolsEnabled,
                  })
                );
              }}
            >
              Build preview
            </RamButton>
          </div>
        </RamField>
        {preview && (
          <details className="ai-context-preview" open>
            <summary>
              ~{preview.estimatedTokens.toLocaleString()} input tokens ·{" "}
              {preview.loreEntries} lookup entr{preview.loreEntries === 1 ? "y" : "ies"}
            </summary>
            <p className="settings-note">
              System ~{estimateTokens(preview.system).toLocaleString()} · User ~
              {estimateTokens(preview.user).toLocaleString()}
            </p>
            <RamTextarea readOnly rows={12} value={`SYSTEM\n${preview.system}\n\nUSER\n${preview.user}`} />
          </details>
        )}
      </div>
      <p className="settings-note">
        {spec.keyHint} {spec.note} Keys never leave this browser except as part of the
        request to the selected provider.
      </p>
    </>
  );
}

function AutonomyField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: ToolAutonomy;
  onChange: (value: ToolAutonomy) => void;
  hint: string;
}) {
  return (
    <RamField label={label} hint={hint}>
      <RamSelect
        value={value}
        onChange={(event) => onChange(event.target.value as ToolAutonomy)}
      >
        <option value="announce">Announce only</option>
        <option value="propose">Propose for approval</option>
        <option value="auto">Apply automatically</option>
      </RamSelect>
    </RamField>
  );
}

const COMBAT_RULES_HINT: Record<CombatRules, string> = {
  off: "Initiative order only. No movement or action budgets are tracked.",
  advisory: "Budgets are shown and overspending is logged, but nothing is blocked.",
  strict: "Moves past a creature's remaining speed are refused.",
};

function GameplaySettingsPanel({
  gameplay,
  setGameplay,
}: {
  gameplay: GameplaySettings;
  setGameplay: (patch: Partial<GameplaySettings>) => void;
}) {
  const schemaTokens = estimateToolSchemaTokens(PC_TOOLS);
  const defaultBattleMusic = useRAM((s) => s.defaultBattleMusic);
  const setDefaultBattleMusic = useRAM((s) => s.setDefaultBattleMusic);
  return (
    <>
      <div className="settings-tab-actions">
        <RamIconButton
          label="Reset gameplay settings"
          onClick={() => setGameplay({ ...DEFAULT_GAMEPLAY_SETTINGS })}
        >
          <RotateCcw size={16} strokeWidth={1.5} />
        </RamIconButton>
      </div>
      <div className="settings-fields">
        <AutonomyField
          label="Movement"
          value={gameplay.movement}
          onChange={(movement) => setGameplay({ movement })}
          hint="Announce is the safe default: the PC asks, and you move the token."
        />
        <AutonomyField
          label="Actions"
          value={gameplay.actions}
          onChange={(actions) => setGameplay({ actions })}
          hint="Attacks and other actions never decide their own outcome."
        />
        <AutonomyField
          label="Rolls"
          value={gameplay.rolls}
          onChange={(rolls) => setGameplay({ rolls })}
          hint="Proposed rolls wait for your approval; automatic rolls use the dice tray."
        />
        <AutonomyField
          label="Bookkeeping"
          value={gameplay.bookkeeping}
          onChange={(bookkeeping) => setGameplay({ bookkeeping })}
          hint="Equipping, private memories, and goals only affect the PC sheet."
        />
        <RamField
          label="Function steps"
          hint="Stops models from getting stuck in a function-calling loop."
        >
          <RamInput
            type="number"
            min={1}
            max={12}
            value={gameplay.maxToolSteps}
            onChange={(event) =>
              setGameplay({ maxToolSteps: Number(event.target.value) })
            }
          />
        </RamField>
        <div className="ram-field">
          <span className="ram-field__label">Function schema cost</span>
          <p className="settings-note">
            About {schemaTokens.toLocaleString()} input tokens when all {PC_TOOLS.length}{" "}
            functions are available.
          </p>
        </div>
        <RamField label="Combat rules" hint={COMBAT_RULES_HINT[gameplay.combatRules]}>
          <RamSelect
            value={gameplay.combatRules}
            onChange={(event) =>
              setGameplay({ combatRules: event.target.value as CombatRules })
            }
          >
            <option value="off">Turn order only</option>
            <option value="advisory">Advisory budgets</option>
            <option value="strict">Strict budgets</option>
          </RamSelect>
        </RamField>
        <AudioTrackRow
          label="Battle music"
          icon={Swords}
          variant="field"
          hint="Used for every fight unless the scene has its own battle track."
          track={defaultBattleMusic}
          onChange={setDefaultBattleMusic}
          onPick={unlockSceneAudio}
        />
      </div>
      <div className="settings-toggle-list">
        <SettingToggle
          title="AI PC functions"
          description="Let characters query exact sheet and scene data and declare intentions."
          checked={gameplay.toolsEnabled}
          onChange={(toolsEnabled) => setGameplay({ toolsEnabled })}
        />
        <SettingToggle
          title="Intent bubbles"
          description="Show declarations above PC tokens with approval controls. Off sends them to the console as announce-only."
          checked={gameplay.intentBubbles}
          onChange={(intentBubbles) => setGameplay({ intentBubbles })}
        />
        <SettingToggle
          title="Reveal hazards to PCs"
          description="Allow future terrain queries to include save areas. Off keeps GM hazards secret."
          checked={gameplay.revealHazards}
          onChange={(revealHazards) => setGameplay({ revealHazards })}
        />
        <SettingToggle
          title="Battle vignette"
          description="Tint the screen edges red while a fight is running."
          checked={gameplay.combatVignette}
          onChange={(combatVignette) => setGameplay({ combatVignette })}
        />
        <SettingToggle
          title="Battle music"
          description="Swap the scene's music for the battle track once initiative is rolled."
          checked={gameplay.combatMusicEnabled}
          onChange={(combatMusicEnabled) => setGameplay({ combatMusicEnabled })}
        />
        <SettingToggle
          title="Automatic death saves"
          description="Roll for a dying creature as its turn begins. Off puts the roll on a button in the turn tracker."
          checked={gameplay.autoDeathSaves}
          onChange={(autoDeathSaves) => setGameplay({ autoDeathSaves })}
        />
      </div>
    </>
  );
}

export function SettingsModal() {
  const open = useRAM((s) => s.settingsOpen);
  return open ? <SettingsModalContents /> : null;
}

function SettingsModalContents() {
  const open = useRAM((s) => s.settingsOpen);
  const storedUI = useRAM((s) => s.uiSettings);
  const storedGameplay = useRAM((s) => s.gameplaySettings);
  const storedAI = useRAM((s) => s.settings);
  const commitUI = useRAM((s) => s.setUISettings);
  const commitGameplay = useRAM((s) => s.setGameplaySettings);
  const commitAI = useRAM((s) => s.setSettings);
  const setSettingsOpen = useRAM((s) => s.setSettingsOpen);
  const [ui, setUI] = useState(storedUI);
  const [gameplay, setGameplayState] = useState(storedGameplay);
  const [ai, setAI] = useState(storedAI);
  const [tab, setTab] = useState<SettingsTab>(
    () => consumePendingSettingsTab() ?? "ai"
  );
  const [leaveOpen, setLeaveOpen] = useState(false);
  const setUISettings = (patch: Partial<UISettings>) =>
    setUI((current) => normalizeUISettings({ ...current, ...patch }));
  const setGameplay = (patch: Partial<GameplaySettings>) =>
    setGameplayState((current) => normalizeGameplaySettings({ ...current, ...patch }));
  const setSettings = (patch: Partial<AISettings>) =>
    setAI((current) => normalizeAISettings({ ...current, ...patch }));
  const dirty =
    JSON.stringify({ ui, gameplay, ai }) !==
    JSON.stringify({ ui: storedUI, gameplay: storedGameplay, ai: storedAI });

  useLayoutEffect(() => {
    applyUiDocument(ui);
  }, [ui]);

  useEffect(() => {
    return () => applyUiDocument(useRAM.getState().uiSettings);
  }, []);

  function saveSettings() {
    commitUI(ui);
    commitGameplay(gameplay);
    commitAI(ai);
    flushCampaignWrites();
  }

  function closeSettings() {
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    setSettingsOpen(false);
  }

  useEffect(() => {
    const openAbout = () => setTab("about");
    window.addEventListener(OPEN_SHORTCUTS_EVENT, openAbout);
    return () => window.removeEventListener(OPEN_SHORTCUTS_EVENT, openAbout);
  }, []);

  return (
    <>
    <RamDialog
      open={open}
      title="Settings"
      className="settings-dialog"
      onClose={closeSettings}
      headerActions={
        <RamButton size="sm" icon={Save} disabled={!dirty} onClick={saveSettings}>
          Save
        </RamButton>
      }
    >
      <RamTabs
        tabs={[
          { value: "ai", label: "AI" },
          { value: "gameplay", label: "Gameplay" },
          { value: "appearance", label: "Appearance" },
          { value: "accessibility", label: "Accessibility" },
          { value: "console", label: "Console" },
          { value: "about", label: "About" },
        ]}
        value={tab}
        onChange={(value) => setTab(value as SettingsTab)}
      />

      <div className="settings-tab-panel" role="tabpanel">
        {tab === "ai" && <AISettingsPanel settings={ai} setSettings={setSettings} />}
        {tab === "gameplay" && (
          <GameplaySettingsPanel gameplay={gameplay} setGameplay={setGameplay} />
        )}

        {tab === "appearance" && (
          <>
            <div className="settings-tab-actions">
              <RamIconButton
                label="Reset interface settings"
                onClick={() =>
                  setUISettings({
                    palette: DEFAULT_UI_SETTINGS.palette,
                    density: DEFAULT_UI_SETTINGS.density,
                    gridOpacity: DEFAULT_UI_SETTINGS.gridOpacity,
                    snapToGrid: DEFAULT_UI_SETTINGS.snapToGrid,
                    masterMuted: DEFAULT_UI_SETTINGS.masterMuted,
                    masterVolume: DEFAULT_UI_SETTINGS.masterVolume,
                    musicVolume: DEFAULT_UI_SETTINGS.musicVolume,
                    ambienceVolume: DEFAULT_UI_SETTINGS.ambienceVolume,
                    sfxVolume: DEFAULT_UI_SETTINGS.sfxVolume,
                    diceAnimations: DEFAULT_UI_SETTINGS.diceAnimations,
                    weatherEffects: DEFAULT_UI_SETTINGS.weatherEffects,
                    lightingEffects: DEFAULT_UI_SETTINGS.lightingEffects,
                  })
                }
              >
                <RotateCcw size={16} strokeWidth={1.5} />
              </RamIconButton>
            </div>
            <div className="settings-fields">
              <RamField label="Palette" className="span-all">
                <RamSelect
                  value={ui.palette}
                  onChange={(event) =>
                    setUISettings({ palette: event.target.value as UISettings["palette"] })
                  }
                >
                  {PALETTE_GROUPS.map((group) => (
                    <optgroup label={group.label} key={group.label}>
                      {group.ids.map((id) => (
                        <option value={id} key={id}>
                          {PALETTE_LABELS[id]}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </RamSelect>
              </RamField>
              <RamField label="Interface Spacing">
                <RamSelect
                  value={ui.density}
                  onChange={(event) =>
                    setUISettings({ density: event.target.value as UISettings["density"] })
                  }
                >
                  <option value="dense">Dense</option>
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </RamSelect>
              </RamField>
              <RamField label="Grid Opacity">
                <RamInput
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={ui.gridOpacity}
                  onChange={(event) =>
                    setUISettings({
                      gridOpacity: Math.round(Number(event.target.value)),
                    })
                  }
                />
              </RamField>
              <RamField label="Master Volume">
                <RamInput
                  type="number"
                  min={0}
                  max={100}
                  value={ui.masterVolume}
                  onChange={(event) =>
                    setUISettings({ masterVolume: Math.round(Number(event.target.value)) })
                  }
                />
              </RamField>
              <RamField label="Music Volume">
                <RamInput
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={ui.musicVolume ?? 70}
                  onChange={(event) =>
                    setUISettings({
                      musicVolume: Math.round(Number(event.target.value)),
                    })
                  }
                />
              </RamField>
              <RamField label="Ambience Volume">
                <RamInput
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  value={ui.ambienceVolume ?? 80}
                  onChange={(event) =>
                    setUISettings({
                      ambienceVolume: Math.round(Number(event.target.value)),
                    })
                  }
                />
              </RamField>
              <RamField label="Weather & SFX Volume">
                <RamInput
                  type="number"
                  min={0}
                  max={100}
                  value={ui.sfxVolume}
                  onChange={(event) =>
                    setUISettings({ sfxVolume: Math.round(Number(event.target.value)) })
                  }
                />
              </RamField>
            </div>
            <div className="settings-toggle-list">
              <SettingToggle
                title="Mute all audio"
                description="Silence music, ambience, weather, and sound effects without changing their levels."
                checked={ui.masterMuted}
                onChange={(masterMuted) => setUISettings({ masterMuted })}
              />
              <SettingToggle
                title="Snap tokens to grid"
                description="Place moved tokens on whole grid cells. Turn off for free positioning."
                checked={ui.snapToGrid}
                onChange={(snapToGrid) => setUISettings({ snapToGrid })}
              />
              <SettingToggle
                title="Dice roll simulations"
                description="Play 3D dice animations. Turn off for instant results."
                checked={ui.diceAnimations}
                onChange={(diceAnimations) => setUISettings({ diceAnimations })}
              />
              <SettingToggle
                title="Weather effects"
                description="Animate rain, wind, dust, and thunder on the map."
                checked={ui.weatherEffects}
                onChange={(weatherEffects) => setUISettings({ weatherEffects })}
              />
              <SettingToggle
                title="Lighting effects"
                description="Animate starfields and other lighting overlays."
                checked={ui.lightingEffects}
                onChange={(lightingEffects) => setUISettings({ lightingEffects })}
              />
            </div>
          </>
        )}

        {tab === "accessibility" && (
          <>
            <div className="settings-tab-actions">
              <RamIconButton
                label="Reset accessibility settings"
                onClick={() =>
                  setUISettings({
                    textScale: DEFAULT_UI_SETTINGS.textScale,
                    motion: DEFAULT_UI_SETTINGS.motion,
                    reducedTransparency: DEFAULT_UI_SETTINGS.reducedTransparency,
                    increasedContrast: DEFAULT_UI_SETTINGS.increasedContrast,
                    enhancedFocus: DEFAULT_UI_SETTINGS.enhancedFocus,
                  })
                }
              >
                <RotateCcw size={16} strokeWidth={1.5} />
              </RamIconButton>
            </div>
            <div className="settings-fields">
              <RamField label="Text Size">
                <RamSelect
                  value={ui.textScale}
                  onChange={(event) =>
                    setUISettings({
                      textScale: event.target.value as UISettings["textScale"],
                    })
                  }
                >
                  <option value="default">Default</option>
                  <option value="large">Large</option>
                  <option value="largest">Largest</option>
                </RamSelect>
              </RamField>
              <RamField label="Motion">
                <RamSelect
                  value={ui.motion}
                  onChange={(event) =>
                    setUISettings({ motion: event.target.value as UISettings["motion"] })
                  }
                >
                  <option value="system">Use Device Setting</option>
                  <option value="full">Full Motion</option>
                  <option value="reduced">Reduce Motion</option>
                </RamSelect>
              </RamField>
            </div>
            <div className="settings-toggle-list">
              <SettingToggle
                title="Reduce transparency"
                description="Use fully opaque panels and dialogs."
                checked={ui.reducedTransparency}
                onChange={(checked) => setUISettings({ reducedTransparency: checked })}
              />
              <SettingToggle
                title="Increase contrast"
                description="Strengthen text, controls, and boundaries."
                checked={ui.increasedContrast}
                onChange={(checked) => setUISettings({ increasedContrast: checked })}
              />
              <SettingToggle
                title="Enhanced focus indicators"
                description="Make keyboard focus easier to locate."
                checked={ui.enhancedFocus}
                onChange={(checked) => setUISettings({ enhancedFocus: checked })}
              />
            </div>
          </>
        )}

        {tab === "console" && (
          <>
            <div className="settings-tab-actions">
              <RamIconButton
                label="Reset console and saving settings"
                onClick={() =>
                  setUISettings({
                    autoScrollConsole: DEFAULT_UI_SETTINGS.autoScrollConsole,
                    showDiceDetails: DEFAULT_UI_SETTINGS.showDiceDetails,
                    timeFormat: DEFAULT_UI_SETTINGS.timeFormat,
                    confirmClearConsole: DEFAULT_UI_SETTINGS.confirmClearConsole,
                    confirmDeletes: DEFAULT_UI_SETTINGS.confirmDeletes,
                    autosaveEveryMs: DEFAULT_UI_SETTINGS.autosaveEveryMs,
                    maxConsoleEntries: DEFAULT_UI_SETTINGS.maxConsoleEntries,
                  })
                }
              >
                <RotateCcw size={16} strokeWidth={1.5} />
              </RamIconButton>
            </div>
            <div className="settings-fields">
              <RamField label="Time Format">
                <RamSelect
                  value={ui.timeFormat}
                  onChange={(event) =>
                    setUISettings({
                      timeFormat: event.target.value as UISettings["timeFormat"],
                    })
                  }
                >
                  <option value="system">Use Device Setting</option>
                  <option value="12-hour">12-hour</option>
                  <option value="24-hour">24-hour</option>
                </RamSelect>
              </RamField>
              <RamField
                label="Autosave"
                hint="How often the campaign is written. Never still saves when you leave the page."
              >
                <RamSelect
                  value={String(ui.autosaveEveryMs)}
                  onChange={(event) =>
                    setUISettings({ autosaveEveryMs: Number(event.target.value) })
                  }
                >
                  {AUTOSAVE_EVERY_OPTIONS.map((entry) => (
                    <option value={entry.value} key={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
              <RamField label="Console History Limit" hint="Older verbatim messages are pruned after session memory can summarize them.">
                <RamInput
                  type="number"
                  min={100}
                  max={20000}
                  step={100}
                  value={ui.maxConsoleEntries}
                  onChange={(event) =>
                    setUISettings({ maxConsoleEntries: Number(event.target.value) })
                  }
                />
              </RamField>
            </div>
            <div className="settings-toggle-list">
              <SettingToggle
                title="Auto-scroll"
                description="Follow new console messages automatically."
                checked={ui.autoScrollConsole}
                onChange={(checked) => setUISettings({ autoScrollConsole: checked })}
              />
              <SettingToggle
                title="Show individual dice"
                description="Include every die result with the calculated total."
                checked={ui.showDiceDetails}
                onChange={(checked) => setUISettings({ showDiceDetails: checked })}
              />
              <SettingToggle
                title="Confirm before clearing"
                description="Ask before removing all console messages."
                checked={ui.confirmClearConsole}
                onChange={(checked) => setUISettings({ confirmClearConsole: checked })}
              />
              <SettingToggle
                title="Confirm destructive deletes"
                description="Ask before deleting characters, tokens, items, rules, and environments."
                checked={ui.confirmDeletes}
                onChange={(confirmDeletes) => setUISettings({ confirmDeletes })}
              />
            </div>
          </>
        )}

        {tab === "about" && (
          <div className="about-page">
            <section className="about-block">
              <h3>RAM — Robots &amp; Monsters</h3>
              <p>
                RAM is a digital D&amp;D / TTRPG table where you are the Game Master and
                AI agents play the player characters. It is built for fast, direct
                control of characters, maps, encounters, and the shared narrative while
                keeping each AI character independent.
              </p>
            </section>
            <section className="about-block">
              <h3>Author &amp; repository</h3>
              <p>
                Created by{" "}
                <a
                  href="https://github.com/cartergeoco"
                  target="_blank"
                  rel="noreferrer"
                >
                  Carter
                </a>
                . Source, issues, and releases live on GitHub:
              </p>
              <p>
                <a
                  href="https://github.com/cartergeoco/robotsandmonsters"
                  target="_blank"
                  rel="noreferrer"
                >
                  github.com/cartergeoco/robotsandmonsters
                </a>
              </p>
            </section>
            <section className="about-block">
              <h3>Inspiration &amp; assets</h3>
              <p>
                The multi-agent character approach is inspired by{" "}
                <a
                  href="https://github.com/DougDougGithub/Multi-Agent-GPT-Characters"
                  target="_blank"
                  rel="noreferrer"
                >
                  DougDoug&apos;s Multi-Agent GPT Characters
                </a>
                . Map and token art can be sourced separately from{" "}
                <a
                  href="https://2minutetabletop.com"
                  target="_blank"
                  rel="noreferrer"
                >
                  2-Minute Tabletop
                </a>
                ; those assets are not bundled with this repository.
              </p>
              <p>
                Interface type uses Voces and Lekton, bundled under the SIL Open Font
                License. Dice rolls use the public{" "}
                <a
                  href="https://www.npmjs.com/package/react-ttrpg-dice"
                  target="_blank"
                  rel="noreferrer"
                >
                  react-ttrpg-dice
                </a>{" "}
                library.
              </p>
            </section>
            <section className="about-block">
              <h3>Keyboard shortcuts</h3>
              <p className="settings-note">
                Press <kbd>?</kbd> anytime to open this page. Shortcuts are ignored
                while typing in a field.
              </p>
              <div className="shortcut-list">
                {SHORTCUTS.map(([keys, action]) => (
                  <div className="shortcut-row" key={keys}>
                    <kbd>{keys}</kbd>
                    <span>{action}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </RamDialog>
    <RamUnsavedDialog
      open={leaveOpen}
      description="You have unsaved settings."
      onSave={() => {
        saveSettings();
        setLeaveOpen(false);
        setSettingsOpen(false);
      }}
      onDiscard={() => {
        setLeaveOpen(false);
        setSettingsOpen(false);
      }}
      onClose={() => setLeaveOpen(false)}
    />
    </>
  );
}
