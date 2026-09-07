import { Trash2, Upload, X } from "lucide-react";
import { useRef } from "react";
import { useRAM } from "../store";
import { fileToDataURL } from "../util";

export function EnvironmentPanel() {
  const tokens = useRAM((s) => s.tokens);
  const background = useRAM((s) => s.background);
  const addToken = useRAM((s) => s.addToken);
  const updateToken = useRAM((s) => s.updateToken);
  const deleteToken = useRAM((s) => s.deleteToken);
  const setBackground = useRAM((s) => s.setBackground);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const groups = [
    { kind: "enemy" as const, title: "Enemies" },
    { kind: "npc" as const, title: "NPCs" },
    { kind: "object" as const, title: "Objects" },
  ];

  return (
    <div className="panel env-panel">
      <div className="panel-header">
        <span className="panel-title">Environment</span>
      </div>
      <div className="panel-body">
        <div className="env-section">
          <div className="env-section-title">Map</div>
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
            <>
              <div className="bg-row">
                <button className="file-btn" onClick={() => bgFileRef.current?.click()}>
                  <Upload size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
                  Replace map image
                </button>
                <button
                  className="icon-btn danger"
                  title="Remove map"
                  onClick={() => setBackground(null)}
                >
                  <X size={14} />
                </button>
              </div>
              <div className="bg-scale">
                <span>Scale</span>
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
            </>
          ) : (
            <button className="file-btn" onClick={() => bgFileRef.current?.click()}>
              <Upload size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
              Upload map image
            </button>
          )}
        </div>

        <div className="env-section">
          <div className="env-section-title">Add to map</div>
          <div className="env-add-row">
            <button className="chip-btn" onClick={() => addToken("enemy")}>
              + Enemy
            </button>
            <button className="chip-btn" onClick={() => addToken("npc")}>
              + NPC
            </button>
            <button className="chip-btn" onClick={() => addToken("object")}>
              + Object
            </button>
          </div>
        </div>

        {groups.map(({ kind, title }) => {
          const list = tokens.filter((t) => t.kind === kind);
          if (list.length === 0) return null;
          return (
            <div className="env-section" key={kind}>
              <div className="env-section-title">{title}</div>
              {list.map((t) => (
                <div className="token-row" key={t.id}>
                  <span className="pc-dot" style={{ background: t.color }} />
                  <input
                    className="token-name"
                    value={t.name}
                    spellCheck={false}
                    onChange={(e) => updateToken(t.id, { name: e.target.value })}
                  />
                  {t.kind === "enemy" && (
                    <input
                      type="number"
                      title="HP"
                      style={{ width: 52, textAlign: "center", flexShrink: 0 }}
                      value={t.hp ?? 0}
                      onChange={(e) =>
                        updateToken(t.id, { hp: Number(e.target.value) || 0 })
                      }
                    />
                  )}
                  <button
                    className="icon-btn danger"
                    onClick={() => deleteToken(t.id)}
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
