import { Copy, ImagePlus, MapPinPlus, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRAM } from "../store";
import {
  BUILT_IN_TOKEN_BLUEPRINTS,
  createBlankTokenBlueprint,
} from "../tokenCatalog";
import {
  PC_COLORS,
  calculateCreatureStats,
  tokenDisplayName,
  type CreatureMechanics,
  type TokenBlueprint,
  type TokenKind,
} from "../types";
import { fileToDataURL } from "../util";
import { CreatureMechanicsEditor } from "./CreatureMechanicsEditor";
import { EnvironmentLibrary } from "./EnvironmentLibrary";

import { ItemLibrary } from "./ItemLibrary";
import { PortraitField } from "./PortraitField";
import { RulesLibrary } from "./RulesLibrary";
import { TokenBoundsEditor } from "./TokenBoundsEditor";
import {
  RamBadge,
  RamConfirmDialog,
  RamDialog,
  RamField,
  RamIconButton,
  RamInput,
  RamSelect,
  RamStat,
  RamTabs,
  RamTextarea,
} from "./ui/RamPrimitives";

type LibrarySection = "tokens" | "items" | "rules" | "environments";
type KindFilter = TokenKind | "all";

interface TokenFormValue extends CreatureMechanics {
  kind: TokenKind;
  name: string;
  givenName?: string;
  color: string;
  image?: string;
  portrait?: string;
  notes: string;
  width: number;
  height: number;
  bounds: TokenBlueprint["bounds"];
}

const uid = () => crypto.randomUUID();

function cloneBlueprint(blueprint: TokenBlueprint): TokenBlueprint {
  return {
    ...blueprint,
    id: uid(),
    source: "custom",
    name: `${blueprint.name} Copy`,
    skills: blueprint.skills.map((skill) => ({ ...skill, id: uid() })),
    traits: blueprint.traits.map((trait) => ({ ...trait, id: uid() })),
    features: blueprint.features.map((feature) => ({ ...feature, id: uid() })),
    statuses: blueprint.statuses.map((status) => ({ ...status, id: uid() })),
    ruleChoices: Object.fromEntries(
      Object.entries(blueprint.ruleChoices ?? {}).map(([key, values]) => [key, [...values]])
    ),
    inventory: blueprint.inventory.map((item) => ({ ...item, id: uid() })),
    wallet: { ...blueprint.wallet },
    bounds: blueprint.bounds.map((cell) => ({ ...cell })),
  };
}

function TokenDetailsForm({
  value,
  disabled = false,
  instance = false,
  onChange,
}: {
  value: TokenFormValue;
  disabled?: boolean;
  instance?: boolean;
  onChange: (patch: Partial<TokenFormValue>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rules = useRAM((state) => state.ruleDefinitions);
  const libraryItems = useRAM((state) => state.customLibraryItems);
  const calculated = calculateCreatureStats(value, rules, libraryItems);
  const displayName = instance
    ? value.givenName?.trim() || value.name
    : value.name;

  return (
    <div className="token-details-form">
      {value.kind !== "object" && (
        <>
          <div className="sheet-summary token-editor-summary">
            <RamStat
              label="Hit Points"
              value={value.hp}
              detail={`/ ${calculated.maxHp}`}
              tone={value.hp / Math.max(calculated.maxHp, 1) > 0.3 ? "positive" : "danger"}
            />
            <RamStat label="Armor" value={calculated.armorClass} tone="brass" />
            <RamStat label="Level" value={value.level} />
          </div>
          <PortraitField
            name={displayName}
            portrait={value.portrait}
            disabled={disabled}
            onChange={(portrait) => onChange({ portrait })}
          />
        </>
      )}
      <div className="token-primary-header">
        <RamField label="Name">
          <RamInput
            className="token-title-input"
            value={instance ? value.givenName ?? "" : value.name}
            disabled={disabled}
            placeholder={instance ? value.name : "Token name"}
            onChange={(event) =>
              onChange(
                instance
                  ? { givenName: event.target.value }
                  : { name: event.target.value }
              )
            }
          />
        </RamField>
      </div>

      <div className="token-editor-grid token-type-row">
        {instance && (
          <RamField label="Base Type">
            <RamInput
              value={value.name}
              disabled={disabled}
              onChange={(event) => onChange({ name: event.target.value })}
            />
          </RamField>
        )}
        <RamField label="Token Type">
          <RamSelect
            value={value.kind}
            disabled={disabled}
            onChange={(event) => onChange({ kind: event.target.value as TokenKind })}
          >
            <option value="enemy">Enemy</option>
            <option value="npc">NPC</option>
            <option value="object">Object</option>
          </RamSelect>
        </RamField>
      </div>

      <div
        className={`token-creature-layout${value.kind === "object" ? " is-object" : ""}`}
      >
        <div className="token-visual-editor">
          <TokenBoundsEditor
            bounds={value.bounds}
            image={value.image}
            color={value.color}
            disabled={disabled}
            onChange={(bounds) => {
              const xs = bounds.map((cell) => cell.x);
              const ys = bounds.map((cell) => cell.y);
              onChange({
                bounds,
                width: Math.max(...xs) - Math.min(...xs) + 1,
                height: Math.max(...ys) - Math.min(...ys) + 1,
              });
            }}
          />

          <div className="token-art-row">
            <div className="token-color-options" aria-label="Token color">
              {PC_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-swatch${value.color === color ? " is-active" : ""}`}
                  style={{ "--swatch": color } as React.CSSProperties}
                  disabled={disabled}
                  aria-label={`Use token color ${color}`}
                  aria-pressed={value.color === color}
                  onClick={() => onChange({ color })}
                />
              ))}
            </div>
            {!disabled && (
              <div className="token-art-actions">
                <RamIconButton
                  label={value.image ? "Replace token image" : "Upload token image"}
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={17} strokeWidth={1.5} />
                </RamIconButton>
                {value.image && (
                  <RamIconButton
                    label="Remove token image"
                    variant="danger"
                    onClick={() => onChange({ image: undefined })}
                  >
                    <X size={15} strokeWidth={1.5} />
                  </RamIconButton>
                )}
              </div>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (file) onChange({ image: await fileToDataURL(file) });
                event.target.value = "";
              }}
            />
          </div>
        </div>

        {value.kind !== "object" && (
          <fieldset className="token-mechanics-fieldset" disabled={disabled}>
            <CreatureMechanicsEditor value={value} onChange={onChange} />
            <RamField label="Notes">
              <RamTextarea
                value={value.notes}
                disabled={disabled}
                onChange={(event) => onChange({ notes: event.target.value })}
                placeholder="Appearance, behavior, tactics, or context…"
              />
            </RamField>
          </fieldset>
        )}
      </div>
    </div>
  );
}

export function TokenManager() {
  const open = useRAM((state) => state.tokenManagerOpen);
  const initialKind = useRAM((state) => state.tokenManagerKind);
  const initialTab = useRAM((state) => state.tokenManagerTab);
  const initialTokenId = useRAM((state) => state.tokenManagerTokenId);
  const customBlueprints = useRAM((state) => state.customTokenBlueprints);
  const tokens = useRAM((state) => state.tokens);
  const setOpen = useRAM((state) => state.setTokenManagerOpen);
  const placeToken = useRAM((state) => state.placeToken);
  const addBlueprint = useRAM((state) => state.addTokenBlueprint);
  const updateBlueprint = useRAM((state) => state.updateTokenBlueprint);
  const deleteBlueprint = useRAM((state) => state.deleteTokenBlueprint);
  const updateToken = useRAM((state) => state.updateToken);
  const duplicateToken = useRAM((state) => state.duplicateToken);
  const deleteToken = useRAM((state) => state.deleteToken);

  const [section, setSection] = useState<LibrarySection>("tokens");
  const [filter, setFilter] = useState<KindFilter>("all");
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>("");
  const [selectedTokenId, setSelectedTokenId] = useState<string>("");
  const [deleteTarget, setDeleteTarget] = useState<
    { type: "blueprint" | "token"; id: string; name: string } | undefined
  >();
  const [status, setStatus] = useState("");

  const blueprints = useMemo(
    () =>
      [...BUILT_IN_TOKEN_BLUEPRINTS, ...customBlueprints].sort((a, b) =>
        a.name.localeCompare(b.name)
      ),
    [customBlueprints]
  );
  const visibleBlueprints = blueprints.filter(
    (blueprint) => filter === "all" || blueprint.kind === filter
  );
  const selectedBlueprint =
    visibleBlueprints.find((blueprint) => blueprint.id === selectedBlueprintId) ??
    visibleBlueprints[0];
  const selectedToken = tokens.find((token) => token.id === selectedTokenId);
  const editingMapToken = initialTab === "map";

  useEffect(() => {
    if (!open) return;
    setSection("tokens");
    setFilter(initialKind);
    const first = blueprints.find(
      (blueprint) => initialKind === "all" || blueprint.kind === initialKind
    );
    setSelectedBlueprintId(first?.id ?? "");
    setSelectedTokenId(initialTokenId ?? "");
    setStatus("");
  }, [open, initialKind, initialTab, initialTokenId]);

  function createCustom(kind: TokenKind) {
    const blueprint = createBlankTokenBlueprint(kind);
    addBlueprint(blueprint);
    setFilter(kind);
    setSelectedBlueprintId(blueprint.id);
  }

  function duplicate(blueprint: TokenBlueprint) {
    const copy = cloneBlueprint(blueprint);
    addBlueprint(copy);
    setFilter(copy.kind);
    setSelectedBlueprintId(copy.id);
  }

  function addToMap(blueprint: TokenBlueprint) {
    placeToken(blueprint);
    setStatus(`${blueprint.name} added to the map.`);
  }

  return (
    <>
      <RamDialog
        open={open}
        title={editingMapToken ? "Edit Map Token" : "Library"}
        className="token-manager-dialog"
        onClose={() => setOpen(false)}
      >
        {editingMapToken ? (
          <div className="token-manager-single">
            {selectedToken ? (
              <>
                <div className="token-editor-header">
                  <RamBadge>On Map</RamBadge>
                  <span className="token-editor-header__actions">
                    <RamIconButton
                      label={`Duplicate ${tokenDisplayName(selectedToken)}`}
                      onClick={() => duplicateToken(selectedToken.id)}
                    >
                      <Copy size={16} strokeWidth={1.5} />
                    </RamIconButton>
                    <RamIconButton
                      label={`Delete ${tokenDisplayName(selectedToken)} from map`}
                      variant="danger"
                      onClick={() =>
                        setDeleteTarget({
                          type: "token",
                          id: selectedToken.id,
                          name: tokenDisplayName(selectedToken),
                        })
                      }
                    >
                      <Trash2 size={16} strokeWidth={1.5} />
                    </RamIconButton>
                  </span>
                </div>
                <TokenDetailsForm
                  value={selectedToken}
                  instance
                  onChange={(patch) => updateToken(selectedToken.id, patch)}
                />
              </>
            ) : (
              <div className="token-editor-placeholder">
                This token is no longer on the map.
              </div>
            )}
          </div>
        ) : (
          <>
            <RamTabs
              tabs={[
                { value: "tokens", label: "Tokens" },
                { value: "items", label: "Items" },
                { value: "rules", label: "Rules" },
                { value: "environments", label: "Environments" },
              ]}
              value={section}
              onChange={(value) => setSection(value as LibrarySection)}
            />

            {section === "items" ? (
              <ItemLibrary />
            ) : section === "rules" ? (
              <RulesLibrary />
            ) : section === "environments" ? (
              <EnvironmentLibrary />
            ) : (
              <>
                <div className="token-manager-toolbar">
                  <div className="token-kind-filter" role="group" aria-label="Filter token category">
                    {(["all", "enemy", "npc", "object"] as KindFilter[]).map((kind) => (
                      <button
                        key={kind}
                        className={filter === kind ? "is-active" : ""}
                        aria-pressed={filter === kind}
                        onClick={() => setFilter(kind)}
                      >
                        {kind === "all"
                          ? "All"
                          : kind === "enemy"
                            ? "Enemies"
                            : kind === "npc"
                              ? "NPCs"
                              : "Objects"}
                      </button>
                    ))}
                  </div>
                  <RamIconButton
                    label="Create custom token"
                    onClick={() => createCustom(filter === "all" ? "object" : filter)}
                  >
                    <Plus size={17} strokeWidth={1.5} />
                  </RamIconButton>
                </div>

                <div className="token-manager-workspace">
                  <div className="token-catalog">
                    {visibleBlueprints.map((entry) => (
                      <button
                        key={entry.id}
                        className={`token-catalog-item${
                          selectedBlueprint?.id === entry.id ? " is-selected" : ""
                        }`}
                        onClick={() => setSelectedBlueprintId(entry.id)}
                      >
                        <span className="token-catalog-item__copy">
                          <span>{entry.name}</span>
                          <small>
                            {entry.kind === "npc" ? "NPC" : entry.kind} · {entry.bounds.length}{" "}
                            {entry.bounds.length === 1 ? "cell" : "cells"}
                          </small>
                        </span>
                      </button>
                    ))}
                    {visibleBlueprints.length === 0 && (
                      <span className="token-catalog-empty">No tokens in this category.</span>
                    )}
                  </div>

                  <div className="token-editor">
                    {selectedBlueprint && (
                      <>
                        <div className="token-editor-header">
                          <RamBadge>
                            {selectedBlueprint.source === "built-in" ? "Built-in" : "Custom"}
                          </RamBadge>
                          <span className="token-editor-header__actions">
                            <RamIconButton
                              label={`Add ${selectedBlueprint.name} to map`}
                              variant="brass"
                              onClick={() => addToMap(selectedBlueprint)}
                            >
                              <MapPinPlus size={17} strokeWidth={1.5} />
                            </RamIconButton>
                            <RamIconButton
                              label={`Duplicate ${selectedBlueprint.name}`}
                              onClick={() => duplicate(selectedBlueprint)}
                            >
                              <Copy size={16} strokeWidth={1.5} />
                            </RamIconButton>
                            {selectedBlueprint.source === "custom" && (
                              <RamIconButton
                                label={`Delete ${selectedBlueprint.name}`}
                                variant="danger"
                                onClick={() =>
                                  setDeleteTarget({
                                    type: "blueprint",
                                    id: selectedBlueprint.id,
                                    name: selectedBlueprint.name,
                                  })
                                }
                              >
                                <Trash2 size={16} strokeWidth={1.5} />
                              </RamIconButton>
                            )}
                          </span>
                        </div>
                        <TokenDetailsForm
                          value={selectedBlueprint}
                          disabled={selectedBlueprint.source === "built-in"}
                          onChange={(patch) => updateBlueprint(selectedBlueprint.id, patch)}
                        />
                        {selectedBlueprint.source === "built-in" && (
                          <p className="token-editor-note">
                            Built-in tokens stay unchanged. Duplicate this token to customize it.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
                <span className="token-manager-status" aria-live="polite">
                  {status}
                </span>
              </>
            )}
          </>
        )}
      </RamDialog>

      <RamConfirmDialog
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.name ?? "token"}?`}
        description={
          deleteTarget?.type === "blueprint"
            ? "This custom token will be permanently removed from the library. Tokens already on the map will not change."
            : "This token will be permanently removed from the map."
        }
        confirmLabel="Delete"
        onConfirm={() => {
          if (!deleteTarget) return;
          if (deleteTarget.type === "blueprint") {
            deleteBlueprint(deleteTarget.id);
            setSelectedBlueprintId("");
          } else {
            deleteToken(deleteTarget.id);
            setSelectedTokenId("");
          }
        }}
        onClose={() => setDeleteTarget(undefined)}
      />
    </>
  );
}
