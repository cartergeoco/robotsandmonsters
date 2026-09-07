import { Plus, Trash2, Upload, X } from "lucide-react";
import { useRef } from "react";
import { useRAM } from "../store";
import type { AbilityScores, PC } from "../types";
import { PC_COLORS, abilityMod, formatMod } from "../types";
import { fileToDataURL } from "../util";

const uid = () => crypto.randomUUID();

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </div>
  );
}

export function CharacterSheet() {
  const pc = useRAM((s) => s.pcs.find((p) => p.id === s.selectedPcId) ?? null);
  const updatePC = useRAM((s) => s.updatePC);
  const deletePC = useRAM((s) => s.deletePC);
  const selectPC = useRAM((s) => s.selectPC);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!pc) return null;

  const set = (patch: Partial<PC>) => updatePC(pc.id, patch);
  const setAbility = (key: keyof AbilityScores, v: number) =>
    set({ abilities: { ...pc.abilities, [key]: v } });

  const patchList = <K extends "skills" | "traits" | "features" | "inventory" | "statuses">(
    key: K,
    value: PC[K]
  ) => set({ [key]: value } as Partial<PC>);

  return (
    <div className="panel sheet-drawer">
      <div className="panel-header">
        <span className="pc-dot" style={{ background: pc.color }} />
        <span className="panel-title" style={{ flex: 1 }}>
          Character Sheet
        </span>
        <button className="icon-btn" onClick={() => selectPC(null)} title="Close">
          <X size={14} />
        </button>
      </div>
      <div className="panel-body">
        <div className="sheet-body">
          <div>
            <div className="sheet-section-title">Identity</div>
            <div className="field-grid">
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Name</label>
                <input
                  value={pc.name}
                  onChange={(e) => set({ name: e.target.value })}
                  spellCheck={false}
                />
              </div>
              <div className="field">
                <label>Race</label>
                <input value={pc.race} onChange={(e) => set({ race: e.target.value })} />
              </div>
              <div className="field">
                <label>Class</label>
                <input
                  value={pc.className}
                  onChange={(e) => set({ className: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div>
            <div className="sheet-section-title">Vitals</div>
            <div className="field-grid-3">
              <NumField label="Level" value={pc.level} onChange={(n) => set({ level: n })} />
              <NumField label="HP" value={pc.hp} onChange={(n) => set({ hp: n })} />
              <NumField label="Max HP" value={pc.maxHp} onChange={(n) => set({ maxHp: n })} />
              <NumField label="AC" value={pc.ac} onChange={(n) => set({ ac: n })} />
            </div>
          </div>

          <div>
            <div className="sheet-section-title">Abilities</div>
            <div className="abilities-grid">
              {(Object.keys(pc.abilities) as (keyof AbilityScores)[]).map((k) => (
                <div className="ability" key={k}>
                  <label>{k}</label>
                  <input
                    type="number"
                    value={pc.abilities[k]}
                    onChange={(e) => setAbility(k, Number(e.target.value) || 0)}
                  />
                  <span className="mod">{formatMod(abilityMod(pc.abilities[k]))}</span>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="sheet-section-title">Personality (drives the AI)</div>
            <textarea
              value={pc.personality}
              onChange={(e) => set({ personality: e.target.value })}
              placeholder="Voice, quirks, motivations, fears…"
            />
          </div>

          <div>
            <div className="sheet-section-title">Skills</div>
            <div className="list-editor">
              {pc.skills.map((s2) => (
                <div className="list-row" key={s2.id}>
                  <input
                    className="grow"
                    value={s2.name}
                    placeholder="Skill"
                    onChange={(e) =>
                      patchList(
                        "skills",
                        pc.skills.map((x) =>
                          x.id === s2.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />
                  <input
                    className="narrow"
                    type="number"
                    value={s2.bonus}
                    onChange={(e) =>
                      patchList(
                        "skills",
                        pc.skills.map((x) =>
                          x.id === s2.id ? { ...x, bonus: Number(e.target.value) || 0 } : x
                        )
                      )
                    }
                  />
                  <button
                    className="icon-btn danger"
                    onClick={() =>
                      patchList("skills", pc.skills.filter((x) => x.id !== s2.id))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                className="list-add"
                onClick={() =>
                  patchList("skills", [...pc.skills, { id: uid(), name: "", bonus: 0 }])
                }
              >
                <Plus size={12} /> Add skill
              </button>
            </div>
          </div>

          {(["traits", "features"] as const).map((key) => (
            <div key={key}>
              <div className="sheet-section-title">{key}</div>
              <div className="list-editor">
                {pc[key].map((t) => (
                  <div className="list-row" key={t.id}>
                    <input
                      style={{ width: 100, flexShrink: 0 }}
                      value={t.name}
                      placeholder="Name"
                      onChange={(e) =>
                        patchList(
                          key,
                          pc[key].map((x) =>
                            x.id === t.id ? { ...x, name: e.target.value } : x
                          )
                        )
                      }
                    />
                    <input
                      className="grow"
                      value={t.description}
                      placeholder="Description"
                      onChange={(e) =>
                        patchList(
                          key,
                          pc[key].map((x) =>
                            x.id === t.id ? { ...x, description: e.target.value } : x
                          )
                        )
                      }
                    />
                    <button
                      className="icon-btn danger"
                      onClick={() => patchList(key, pc[key].filter((x) => x.id !== t.id))}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
                <button
                  className="list-add"
                  onClick={() =>
                    patchList(key, [...pc[key], { id: uid(), name: "", description: "" }])
                  }
                >
                  <Plus size={12} /> Add {key === "traits" ? "trait" : "feature"}
                </button>
              </div>
            </div>
          ))}

          <div>
            <div className="sheet-section-title">Inventory</div>
            <div className="list-editor">
              {pc.inventory.map((it) => (
                <div className="list-row" key={it.id}>
                  <input
                    className="grow"
                    value={it.name}
                    placeholder="Item"
                    onChange={(e) =>
                      patchList(
                        "inventory",
                        pc.inventory.map((x) =>
                          x.id === it.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />
                  <input
                    className="narrow"
                    type="number"
                    value={it.qty}
                    onChange={(e) =>
                      patchList(
                        "inventory",
                        pc.inventory.map((x) =>
                          x.id === it.id ? { ...x, qty: Number(e.target.value) || 0 } : x
                        )
                      )
                    }
                  />
                  <button
                    className="icon-btn danger"
                    onClick={() =>
                      patchList("inventory", pc.inventory.filter((x) => x.id !== it.id))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                className="list-add"
                onClick={() =>
                  patchList("inventory", [
                    ...pc.inventory,
                    { id: uid(), name: "", qty: 1, notes: "" },
                  ])
                }
              >
                <Plus size={12} /> Add item
              </button>
            </div>
          </div>

          <div>
            <div className="sheet-section-title">Buffs / Debuffs</div>
            <div className="list-editor">
              {pc.statuses.map((st) => (
                <div className="list-row" key={st.id}>
                  <input
                    className="grow"
                    value={st.name}
                    placeholder="Effect"
                    onChange={(e) =>
                      patchList(
                        "statuses",
                        pc.statuses.map((x) =>
                          x.id === st.id ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />
                  <select
                    value={st.kind}
                    onChange={(e) =>
                      patchList(
                        "statuses",
                        pc.statuses.map((x) =>
                          x.id === st.id
                            ? { ...x, kind: e.target.value as "buff" | "debuff" }
                            : x
                        )
                      )
                    }
                  >
                    <option value="buff">Buff</option>
                    <option value="debuff">Debuff</option>
                  </select>
                  <button
                    className="icon-btn danger"
                    onClick={() =>
                      patchList("statuses", pc.statuses.filter((x) => x.id !== st.id))
                    }
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button
                className="list-add"
                onClick={() =>
                  patchList("statuses", [
                    ...pc.statuses,
                    { id: uid(), name: "", kind: "buff", note: "" },
                  ])
                }
              >
                <Plus size={12} /> Add effect
              </button>
            </div>
          </div>

          <div>
            <div className="sheet-section-title">Token</div>
            <div className="color-swatches" style={{ marginBottom: 8 }}>
              {PC_COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch${pc.color === c ? " active" : ""}`}
                  style={{ background: c }}
                  onClick={() => set({ color: c })}
                  title={c}
                />
              ))}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) set({ image: await fileToDataURL(f) });
                e.target.value = "";
              }}
            />
            <button className="file-btn" onClick={() => fileRef.current?.click()}>
              <Upload size={12} style={{ verticalAlign: -2, marginRight: 6 }} />
              {pc.image ? "Replace token art" : "Upload token art"}
            </button>
            {pc.image && (
              <button
                className="list-add"
                onClick={() => set({ image: undefined })}
                style={{ marginTop: 4 }}
              >
                Remove token art
              </button>
            )}
          </div>

          <button
            className="sheet-danger"
            onClick={() => {
              if (confirm(`Delete ${pc.name}? This cannot be undone.`)) deletePC(pc.id);
            }}
          >
            <Trash2 size={13} />
            Delete character
          </button>
        </div>
      </div>
    </div>
  );
}
