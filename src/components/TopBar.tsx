import { Settings } from "lucide-react";
import { useRAM } from "../store";

export function TopBar() {
  const campaignName = useRAM((s) => s.campaignName);
  const setCampaignName = useRAM((s) => s.setCampaignName);
  const setSettingsOpen = useRAM((s) => s.setSettingsOpen);

  return (
    <div className="topbar">
      <span className="brand">RAM</span>
      <input
        className="campaign-input"
        value={campaignName}
        onChange={(e) => setCampaignName(e.target.value)}
        spellCheck={false}
        aria-label="Campaign name"
      />
      <button
        className="icon-btn"
        onClick={() => setSettingsOpen(true)}
        title="Settings"
      >
        <Settings size={15} />
      </button>
    </div>
  );
}
