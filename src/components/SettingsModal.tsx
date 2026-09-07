import { X } from "lucide-react";
import { useRAM } from "../store";

export function SettingsModal() {
  const open = useRAM((s) => s.settingsOpen);
  const settings = useRAM((s) => s.settings);
  const setSettings = useRAM((s) => s.setSettings);
  const setSettingsOpen = useRAM((s) => s.setSettingsOpen);

  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="panel-header">
          <span className="panel-title" style={{ flex: 1 }}>
            AI Settings
          </span>
          <button className="icon-btn" onClick={() => setSettingsOpen(false)}>
            <X size={14} />
          </button>
        </div>
        <div className="sheet-body">
          <div className="field">
            <label>API Base URL</label>
            <input
              value={settings.baseUrl}
              spellCheck={false}
              onChange={(e) => setSettings({ baseUrl: e.target.value })}
              placeholder="https://api.openai.com/v1"
            />
          </div>
          <div className="field">
            <label>API Key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={(e) => setSettings({ apiKey: e.target.value })}
              placeholder="sk-…"
            />
          </div>
          <div className="field">
            <label>Model</label>
            <input
              value={settings.model}
              spellCheck={false}
              onChange={(e) => setSettings({ model: e.target.value })}
              placeholder="gpt-4o-mini"
            />
          </div>
          <p className="modal-note">
            Works with any OpenAI-compatible API (OpenAI, OpenRouter, LM Studio,
            Ollama, etc.). Your key is stored locally in this browser and is only
            sent to the base URL above.
          </p>
        </div>
      </div>
    </div>
  );
}
