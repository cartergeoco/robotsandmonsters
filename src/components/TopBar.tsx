import { FolderOpen, Github, Map, Redo2, Settings, Undo2 } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import {
  getHistoryStatus,
  redoCampaignChange,
  subscribeHistory,
  undoCampaignChange,
} from "../history";
import {
  getCampaignStorageStatus,
  subscribeCampaignStorageStatus,
} from "../persistStorage";
import { useRAM } from "../store";
import { OPEN_CAMPAIGNS_EVENT } from "./QoLHost";
import { RamIconButton, RamInput } from "./ui/RamPrimitives";

export function TopBar() {
  const campaignName = useRAM((s) => s.campaignName);
  const setCampaignName = useRAM((s) => s.setCampaignName);
  const setSettingsOpen = useRAM((s) => s.setSettingsOpen);
  const activeView = useRAM((s) => s.activeView);
  const setActiveView = useRAM((s) => s.setActiveView);
  const [history, setHistory] = useState(() => getHistoryStatus());
  const storage = useSyncExternalStore(
    subscribeCampaignStorageStatus,
    getCampaignStorageStatus,
    getCampaignStorageStatus
  );

  const [saveNotice, setSaveNotice] = useState("");

  useEffect(() => subscribeHistory(() => setHistory(getHistoryStatus())), []);

  useEffect(() => {
    if (storage.state === "saving") {
      setSaveNotice("Saving…");
      return;
    }
    if (storage.state === "error") {
      setSaveNotice("Save failed");
      return;
    }
    if (!storage.lastSavedAt) {
      setSaveNotice("");
      return;
    }
    const remaining = 30_000 - (Date.now() - storage.lastSavedAt);
    if (remaining <= 0) {
      setSaveNotice("");
      return;
    }
    setSaveNotice(
      `Saved ${new Date(storage.lastSavedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    );
    const timer = window.setTimeout(() => setSaveNotice(""), remaining);
    return () => window.clearTimeout(timer);
  }, [storage.lastSavedAt, storage.state]);

  return (
    <div className="topbar">
      <span className="topbar-actions topbar-actions--left">
        <RamIconButton
          className={activeView === "grid" ? "is-active" : ""}
          label="Open encounter grid"
          onClick={() => setActiveView("grid")}
        >
          <img className="brand-logo" src="/ram-logo.png" alt="" />
        </RamIconButton>
        <RamIconButton
          className={activeView === "world-map" ? "is-active" : ""}
          label="Open world map"
          onClick={() => setActiveView("world-map")}
        >
          <Map size={17} strokeWidth={1.5} />
        </RamIconButton>
      </span>
      <span className="campaign-slot">
        <RamInput
          className="campaign-input"
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          spellCheck={false}
          aria-label="Campaign name"
        />
        {saveNotice && (
          <small
            className={`save-indicator${storage.state === "error" ? " save-indicator--error" : ""}`}
            aria-live="polite"
          >
            {saveNotice}
          </small>
        )}
      </span>
      <span className="topbar-actions topbar-actions--right">
        <RamIconButton
          label="Undo last campaign change"
          disabled={!history.canUndo}
          onClick={undoCampaignChange}
        >
          <Undo2 size={16} strokeWidth={1.5} />
        </RamIconButton>
        <RamIconButton
          label="Redo campaign change"
          disabled={!history.canRedo}
          onClick={redoCampaignChange}
        >
          <Redo2 size={16} strokeWidth={1.5} />
        </RamIconButton>
        <RamIconButton
          label="Campaigns and backups"
          onClick={() => window.dispatchEvent(new Event(OPEN_CAMPAIGNS_EVENT))}
        >
          <FolderOpen size={16} strokeWidth={1.5} />
        </RamIconButton>
        <a
          href="https://github.com/cartergeoco/robotsandmonsters"
          className="topbar-link"
          aria-label="Open RAM on GitHub"
          title="GitHub repository"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={16} strokeWidth={1.5} />
        </a>
        <RamIconButton label="Settings" onClick={() => setSettingsOpen(true)}>
          <Settings size={16} strokeWidth={1.5} />
        </RamIconButton>
      </span>
    </div>
  );
}
