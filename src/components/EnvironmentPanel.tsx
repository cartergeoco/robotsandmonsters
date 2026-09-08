import { Copy, Library, Pencil, Trash2, Upload, X } from "lucide-react";
import { useRef } from "react";
import { useRAM } from "../store";
import {
  ENVIRONMENT_LIGHTING,
  ENVIRONMENT_LIGHTING_LABELS,
  tokenDisplayName,
  type EnvironmentLighting,
} from "../types";
import { fileToDataURL } from "../util";
import {
  RamIconButton,
  RamPanel,
  RamPanelBody,
  RamPanelHeader,
  RamSection,
  RamSelect,
} from "./ui/RamPrimitives";

export function EnvironmentPanel() {
  const tokens = useRAM((s) => s.tokens);
  const background = useRAM((s) => s.background);
  const lighting = useRAM((s) => s.lighting);
  const setBackground = useRAM((s) => s.setBackground);
  const setLighting = useRAM((s) => s.setLighting);
  const setTokenManagerOpen = useRAM((s) => s.setTokenManagerOpen);
  const duplicateToken = useRAM((s) => s.duplicateToken);
  const deleteToken = useRAM((s) => s.deleteToken);
  const bgFileRef = useRef<HTMLInputElement>(null);

  const groups = [
    { kind: "enemy" as const, title: "Enemies" },
    { kind: "npc" as const, title: "NPCs" },
    { kind: "object" as const, title: "Objects" },
  ];

  return (
    <RamPanel className="env-panel">
      <RamPanelHeader
        title="Environment"
        actions={
          <RamIconButton label="Open token library" onClick={() => setTokenManagerOpen(true)}>
            <Library size={17} strokeWidth={1.5} />
          </RamIconButton>
        }
      />
      <RamPanelBody>
        <div className="env-scene">
          <div className="env-scene__row">
            <RamSelect
              aria-label="Lighting"
              value={lighting}
              onChange={(event) =>
                setLighting(event.target.value as EnvironmentLighting)
              }
            >
              {ENVIRONMENT_LIGHTING.map((value) => (
                <option value={value} key={value}>
                  {ENVIRONMENT_LIGHTING_LABELS[value]}
                </option>
              ))}
            </RamSelect>
            <span className="section-actions">
              <RamIconButton label={background ? "Replace map image" : "Upload map image"} onClick={() => bgFileRef.current?.click()}>
                <Upload size={18} strokeWidth={1.5} />
              </RamIconButton>
              {background && (
                <RamIconButton
                  label="Remove map"
                  variant="danger"
                  onClick={() => setBackground(null)}
                >
                  <X size={16} strokeWidth={1.5} />
                </RamIconButton>
              )}
            </span>
          </div>
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
            <div className="bg-scale">
              <span className="ram-eyebrow">Map scale</span>
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
          ) : (
            <span className="empty-inline">No map loaded</span>
          )}
        </div>

        <RamSection
          title="Tokens"
          action={
            <RamIconButton label="Browse token library" onClick={() => setTokenManagerOpen(true)}>
              <Library size={16} strokeWidth={1.5} />
            </RamIconButton>
          }
        >
          <div className="env-token-tree">
            {groups.map(({ kind, title }) => {
              const list = tokens
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
                      <div
                        className={`token-row token-row--${kind}${
                          token.givenName.trim() ? " is-named" : ""
                        }`}
                        key={token.id}
                      >
                        <button
                          className="token-name"
                          onClick={() => setTokenManagerOpen(true, kind, "map", token.id)}
                        >
                          {tokenDisplayName(token)}
                        </button>
                        {token.hp !== undefined && (
                          <span className="token-hp">
                            {token.hp}/{token.maxHp}
                          </span>
                        )}
                        <span className="token-row__actions">
                          <RamIconButton
                            label={`Edit ${tokenDisplayName(token)}`}
                            onClick={() => setTokenManagerOpen(true, kind, "map", token.id)}
                          >
                            <Pencil size={13} strokeWidth={1.5} />
                          </RamIconButton>
                          <RamIconButton
                            label={`Duplicate ${tokenDisplayName(token)}`}
                            onClick={() => duplicateToken(token.id)}
                          >
                            <Copy size={13} strokeWidth={1.5} />
                          </RamIconButton>
                          <RamIconButton
                            label={`Delete ${tokenDisplayName(token)}`}
                            variant="danger"
                            onClick={() => {
                              if (window.confirm(`Delete ${tokenDisplayName(token)} from the map?`)) {
                                deleteToken(token.id);
                              }
                            }}
                          >
                            <Trash2 size={13} strokeWidth={1.5} />
                          </RamIconButton>
                        </span>
                      </div>
                    ))}
                    {list.length === 0 && <span className="token-tree-empty">None on map</span>}
                  </div>
                </section>
              );
            })}
          </div>
        </RamSection>
      </RamPanelBody>
    </RamPanel>
  );
}
