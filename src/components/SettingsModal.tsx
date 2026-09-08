import { RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { listProviderModels, testAIConnection } from "../ai";
import {
  AI_PROVIDER_GROUPS,
  omitTemperature,
  providerSpec,
  providersInGroup,
  switchAIProvider,
} from "../aiProviders";
import { useRAM } from "../store";
import {
  AI_REASONING_EFFORTS,
  DEFAULT_UI_SETTINGS,
  DICE_LOOKS,
  DICE_LOOK_LABELS,
  GRID_SIZE_MAX,
  GRID_SIZE_MIN,
  GRID_SIZE_STEP,
  type AIProvider,
  type AIReasoningEffort,
  type DiceLook,
  type UIPalette,
  type UISettings,
} from "../types";
import {
  RamButton,
  RamDialog,
  RamField,
  RamIconButton,
  RamInput,
  RamSelect,
  RamTabs,
  RamTextarea,
} from "./ui/RamPrimitives";

type SettingsTab = "ai" | "appearance" | "accessibility" | "console";

const PALETTE_LABELS: Record<UIPalette, string> = {
  default: "Default",
  "high-contrast": "High Contrast",
  "pitch-black": "Pitch Black",
  "pearl-white": "Pearl White",
  nebula: "Nebula",
  molten: "Molten",
  obsidian: "Obsidian",
  ice: "Ice",
  stone: "Stone",
  "90s": "90s",
  console: "Console",
};

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

function AISettingsPanel() {
  const settings = useRAM((s) => s.settings);
  const setSettings = useRAM((s) => s.setSettings);
  const spec = providerSpec(settings.provider);
  const [remoteModels, setRemoteModels] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState<"test" | "models" | null>(null);
  const [customModel, setCustomModel] = useState(false);

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

  return (
    <>
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
          label="Scene log messages"
          hint="How many recent journal lines this character can see."
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
        {status && <p className="settings-ai-status">{status}</p>}
      </div>
      <p className="settings-note">
        {spec.keyHint} {spec.note} Keys never leave this browser except as part of the
        request to the selected provider.
      </p>
    </>
  );
}

export function SettingsModal() {
  const open = useRAM((s) => s.settingsOpen);
  const ui = useRAM((s) => s.uiSettings);
  const setUISettings = useRAM((s) => s.setUISettings);
  const setSettingsOpen = useRAM((s) => s.setSettingsOpen);
  const [tab, setTab] = useState<SettingsTab>("ai");

  return (
    <RamDialog
      open={open}
      title="Settings"
      className="settings-dialog"
      onClose={() => setSettingsOpen(false)}
    >
      <RamTabs
        tabs={[
          { value: "ai", label: "AI" },
          { value: "appearance", label: "Appearance" },
          { value: "accessibility", label: "Accessibility" },
          { value: "console", label: "Console" },
        ]}
        value={tab}
        onChange={(value) => setTab(value as SettingsTab)}
      />

      <div className="settings-tab-panel" role="tabpanel">
        {tab === "ai" && <AISettingsPanel />}

        {tab === "appearance" && (
          <>
            <div className="settings-tab-actions">
              <RamIconButton
                label="Reset interface settings"
                onClick={() => setUISettings({ ...DEFAULT_UI_SETTINGS })}
              >
                <RotateCcw size={16} strokeWidth={1.5} />
              </RamIconButton>
            </div>
            <div className="settings-fields">
              <RamField label="Theme">
                <RamSelect
                  value={ui.theme}
                  onChange={(event) =>
                    setUISettings({ theme: event.target.value as UISettings["theme"] })
                  }
                >
                  <option value="system">Use Device Setting</option>
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </RamSelect>
              </RamField>
              <RamField label="Color Palette">
                <RamSelect
                  value={ui.palette}
                  onChange={(event) =>
                    setUISettings({ palette: event.target.value as UIPalette })
                  }
                >
                  {Object.entries(PALETTE_LABELS).map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
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
                  <option value="compact">Compact</option>
                  <option value="comfortable">Comfortable</option>
                </RamSelect>
              </RamField>
              <RamField label="Grid Size">
                <RamSelect
                  value={String(ui.gridSize)}
                  onChange={(event) =>
                    setUISettings({ gridSize: Number(event.target.value) })
                  }
                >
                  {Array.from(
                    { length: (GRID_SIZE_MAX - GRID_SIZE_MIN) / GRID_SIZE_STEP + 1 },
                    (_, index) => GRID_SIZE_MIN + index * GRID_SIZE_STEP
                  ).map((size) => (
                    <option value={size} key={size}>
                      {size} px
                    </option>
                  ))}
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
              <RamField label="Dice Look">
                <RamSelect
                  value={ui.diceLook}
                  onChange={(event) =>
                    setUISettings({ diceLook: event.target.value as DiceLook })
                  }
                >
                  {DICE_LOOKS.map((look) => (
                    <option value={look} key={look}>
                      {DICE_LOOK_LABELS[look]}
                    </option>
                  ))}
                </RamSelect>
              </RamField>
            </div>
          </>
        )}

        {tab === "accessibility" && (
          <>
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
            </div>
          </>
        )}
      </div>
    </RamDialog>
  );
}
