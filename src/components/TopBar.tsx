import { Github, Map, Settings } from "lucide-react";
import { useRAM } from "../store";
import { RamIconButton, RamInput } from "./ui/RamPrimitives";

export function TopBar() {
  const campaignName = useRAM((s) => s.campaignName);
  const setCampaignName = useRAM((s) => s.setCampaignName);
  const setSettingsOpen = useRAM((s) => s.setSettingsOpen);
  const activeView = useRAM((s) => s.activeView);
  const setActiveView = useRAM((s) => s.setActiveView);

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
      </span>
      <span className="topbar-actions topbar-actions--right">
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
