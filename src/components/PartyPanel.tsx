import { Plus } from "lucide-react";
import { useRAM } from "../store";

export function PartyPanel() {
  const pcs = useRAM((s) => s.pcs);
  const selectedPcId = useRAM((s) => s.selectedPcId);
  const selectPC = useRAM((s) => s.selectPC);
  const addPC = useRAM((s) => s.addPC);

  return (
    <div className="panel party-panel">
      <div className="panel-header">
        <span className="panel-title">Party</span>
      </div>
      <div className="panel-body">
        {pcs.length === 0 && (
          <div className="empty-hint">
            No characters yet.
            <br />
            Create one to begin your campaign.
          </div>
        )}
        {pcs.map((pc) => {
          const frac = pc.maxHp > 0 ? Math.max(0, Math.min(1, pc.hp / pc.maxHp)) : 0;
          const hpColor = frac > 0.5 ? "#8fb996" : frac > 0.25 ? "#c9a86a" : "#b0524f";
          return (
            <div
              key={pc.id}
              className={`pc-card${pc.id === selectedPcId ? " selected" : ""}`}
              onClick={() => selectPC(pc.id === selectedPcId ? null : pc.id)}
            >
              <div className="pc-card-top">
                <span className="pc-dot" style={{ background: pc.color }} />
                <span className="pc-name">{pc.name}</span>
                <span className="pc-sub">Lv {pc.level}</span>
              </div>
              <div className="pc-sub">
                {pc.race} {pc.className} · AC {pc.ac}
              </div>
              <div className="hp-bar">
                <div
                  className="hp-bar-fill"
                  style={{ width: `${frac * 100}%`, background: hpColor }}
                />
              </div>
              <div className="pc-hp-label">
                <span>HP</span>
                <span>
                  {pc.hp} / {pc.maxHp}
                </span>
              </div>
            </div>
          );
        })}
        <button className="add-pc-btn" onClick={() => addPC()}>
          <Plus size={14} />
          New Character
        </button>
      </div>
    </div>
  );
}
