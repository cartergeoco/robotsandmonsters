import { Copy, Plus, Trash2, Upload, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRAM } from "../store";
import {
  CONTAINER_TYPES,
  DAMAGE_DICE,
  DAMAGE_TYPES,
  ITEM_CATEGORIES,
  WEAPON_PROPERTIES,
  type DamageDie,
  type ItemCategory,
  type LibraryItem,
} from "../types";
import { fileToDataURL } from "../util";
import {
  RamField,
  RamIconButton,
  RamInput,
  RamSelect,
  RamTextarea,
} from "./ui/RamPrimitives";
import { TagInput } from "./ui/TagInput";

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  weapon: "Weapons",
  tool: "Tools",
  armor: "Armor",
  gear: "Gear",
  consumable: "Consumables",
  material: "Materials",
  quest: "Quest",
  junk: "Junk",
  misc: "Misc",
};

const PROPERTY_SUGGESTIONS = [
  ...WEAPON_PROPERTIES,
  "Ammunition 25/100",
  "Ammunition 30/120",
  "Ammunition 80/320",
  "Ammunition 100/400",
  "Ammunition 150/600",
  "Thrown 5/15",
  "Thrown 20/60",
  "Thrown 30/120",
  "Versatile 1d8",
  "Versatile 1d10",
] as const;

function formatCost(copper: number): string {
  if (copper >= 100 && copper % 100 === 0) return `${copper / 100} gp`;
  if (copper >= 10 && copper % 10 === 0) return `${copper / 10} sp`;
  return `${copper} cp`;
}

function newItem(category: ItemCategory): LibraryItem {
  return {
    id: crypto.randomUUID(),
    category,
    name: `New ${CATEGORY_LABELS[category].replace(/s$/, "")}`,
    description: "",
    value: 0,
    weight: 0,
    equipSlot:
      category === "weapon"
        ? "weapon"
        : category === "armor"
          ? "armor"
          : category === "gear"
            ? "gear"
            : "none",
    armorClass: category === "armor" ? 10 : 0,
    armorBonus: 0,
    hpBonus: 0,
    costCp: 0,
    sourcePage: 0,
    damage: "",
    damageDiceCount: category === "weapon" ? 1 : 0,
    damageDie: "d6",
    damageType: category === "weapon" ? "slashing" : "",
    weaponClass: category === "weapon" ? "simple" : "",
    weaponRange: category === "weapon" ? "melee" : "",
    properties: [],
    armorDexterity: category === "armor" ? "full" : "none",
    strengthRequirement: 0,
    stealthDisadvantage: false,
    containerType: "",
    contents: "",
    capacity: "",
    actions: [],
    contains: [],
  };
}

function damageText(count: number, die: DamageDie): string {
  return count > 0 ? `${count}${die}` : "";
}

export function ItemLibrary() {
  const items = useRAM((state) => state.customLibraryItems);
  const addItem = useRAM((state) => state.addLibraryItem);
  const updateItem = useRAM((state) => state.updateLibraryItem);
  const deleteItem = useRAM((state) => state.deleteLibraryItem);
  const [category, setCategory] = useState<ItemCategory>("weapon");
  const [selectedId, setSelectedId] = useState("");
  const imageRef = useRef<HTMLInputElement>(null);
  const visibleItems = useMemo(
    () =>
      items
        .filter((item) => item.category === category)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [category, items]
  );
  const selected = items.find((item) => item.id === selectedId) ?? visibleItems[0];

  useEffect(() => {
    if (!selected || selected.category !== category) {
      setSelectedId(visibleItems[0]?.id ?? "");
    }
  }, [category, selected, visibleItems]);

  function create() {
    const value = newItem(category);
    addItem(value);
    setSelectedId(value.id);
  }

  function duplicate(value: LibraryItem) {
    const copy: LibraryItem = {
      ...value,
      id: crypto.randomUUID(),
      name: `${value.name} Copy`,
      properties: [...value.properties],
      actions: [...value.actions],
      contains: [...value.contains],
    };
    addItem(copy);
    setCategory(copy.category);
    setSelectedId(copy.id);
  }

  const updateDamage = (count: number, die: DamageDie) => {
    if (!selected) return;
    updateItem(selected.id, {
      damageDiceCount: count,
      damageDie: die,
      damage: damageText(count, die),
    });
  };

  return (
    <div className="item-library">
      <nav className="item-category-tabs" aria-label="Item categories">
        {ITEM_CATEGORIES.map((entry) => (
          <button
            key={entry}
            className={entry === category ? "is-active" : ""}
            aria-current={entry === category ? "page" : undefined}
            onClick={() => setCategory(entry)}
          >
            <span>{CATEGORY_LABELS[entry]}</span>
            <small>{items.filter((item) => item.category === entry).length}</small>
          </button>
        ))}
      </nav>

      <div className="item-catalog">
        <div className="library-column-header">
          <span>{CATEGORY_LABELS[category]}</span>
          <RamIconButton
            label={`Create ${CATEGORY_LABELS[category].toLowerCase()} item`}
            onClick={create}
          >
            <Plus size={17} strokeWidth={1.5} />
          </RamIconButton>
        </div>
        <div className="item-catalog-list">
          {visibleItems.map((item) => (
            <button
              key={item.id}
              className={`item-catalog-entry${item.id === selected?.id ? " is-selected" : ""}`}
              onClick={() => setSelectedId(item.id)}
            >
              {item.image ? (
                <img className="item-catalog-thumb" src={item.image} alt="" />
              ) : (
                <span className="item-catalog-thumb item-catalog-thumb--empty" aria-hidden="true" />
              )}
              <span className="item-catalog-copy">
                <span>{item.name}</span>
                <small>{formatCost(item.costCp)} · {item.weight} lb.</small>
              </span>
            </button>
          ))}
          {visibleItems.length === 0 && (
            <span className="token-catalog-empty">No items in this category.</span>
          )}
        </div>
      </div>

      <div className="item-editor">
        {selected ? (
          <>
            <div className="token-editor-header">
              <span className="ram-eyebrow">{CATEGORY_LABELS[selected.category]} details</span>
              <span className="token-editor-header__actions">
                <RamIconButton label={`Duplicate ${selected.name}`} onClick={() => duplicate(selected)}>
                  <Copy size={16} strokeWidth={1.5} />
                </RamIconButton>
                <RamIconButton
                  label={`Delete ${selected.name}`}
                  variant="danger"
                  onClick={() => {
                    if (window.confirm(`Delete ${selected.name} from the item library?`)) {
                      deleteItem(selected.id);
                      setSelectedId("");
                    }
                  }}
                >
                  <Trash2 size={16} strokeWidth={1.5} />
                </RamIconButton>
              </span>
            </div>

            <div className="item-editor-fields">
              <RamField label="Name" className="span-all">
                <RamInput
                  value={selected.name}
                  onChange={(event) => updateItem(selected.id, { name: event.target.value })}
                />
              </RamField>
              <RamField label="Value (cp)">
                <RamInput
                  type="number"
                  min={0}
                  value={selected.costCp}
                  onChange={(event) => {
                    const costCp = Math.max(0, Number(event.target.value));
                    updateItem(selected.id, { costCp, value: costCp / 100 });
                  }}
                />
              </RamField>
              <RamField label="Weight (lb.)">
                <RamInput
                  type="number"
                  min={0}
                  step={0.1}
                  value={selected.weight}
                  onChange={(event) =>
                    updateItem(selected.id, { weight: Math.max(0, Number(event.target.value)) })
                  }
                />
              </RamField>
              <div className="item-image-field span-all">
                <div className={`item-image-preview${selected.image ? " has-image" : ""}`}>
                  {selected.image ? (
                    <img src={selected.image} alt={`${selected.name} image`} />
                  ) : (
                    <span>No image</span>
                  )}
                </div>
                <div className="item-image-field__actions">
                  <RamIconButton
                    label={selected.image ? `Replace ${selected.name} image` : `Upload ${selected.name} image`}
                    onClick={() => imageRef.current?.click()}
                  >
                    <Upload size={16} strokeWidth={1.5} />
                  </RamIconButton>
                  {selected.image && (
                    <RamIconButton
                      label={`Remove ${selected.name} image`}
                      variant="danger"
                      onClick={() => updateItem(selected.id, { image: undefined })}
                    >
                      <X size={15} strokeWidth={1.5} />
                    </RamIconButton>
                  )}
                </div>
                <input
                  ref={imageRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (file) updateItem(selected.id, { image: await fileToDataURL(file) });
                    event.target.value = "";
                  }}
                />
              </div>
            </div>

            {selected.category === "weapon" && (
              <div className="item-detail-group">
                <span className="ram-field__label">Weapon Mechanics</span>
                <div className="item-editor-fields">
                  <RamField label="Weapon Training">
                    <RamSelect
                      value={selected.weaponClass}
                      onChange={(event) =>
                        updateItem(selected.id, {
                          weaponClass: event.target.value as LibraryItem["weaponClass"],
                        })
                      }
                    >
                      <option value="simple">Simple Weapon</option>
                      <option value="martial">Martial Weapon</option>
                    </RamSelect>
                  </RamField>
                  <RamField label="Weapon Type">
                    <RamSelect
                      value={selected.weaponRange}
                      onChange={(event) =>
                        updateItem(selected.id, {
                          weaponRange: event.target.value as LibraryItem["weaponRange"],
                        })
                      }
                    >
                      <option value="melee">Melee Weapon</option>
                      <option value="ranged">Ranged Weapon</option>
                    </RamSelect>
                  </RamField>
                  <RamField label="Damage Dice">
                    <RamInput
                      type="number"
                      min={0}
                      max={20}
                      value={selected.damageDiceCount}
                      onChange={(event) =>
                        updateDamage(Math.max(0, Number(event.target.value)), selected.damageDie)
                      }
                    />
                  </RamField>
                  <RamField label="Die">
                    <RamSelect
                      value={selected.damageDie}
                      onChange={(event) =>
                        updateDamage(
                          selected.damageDiceCount,
                          event.target.value as DamageDie
                        )
                      }
                    >
                      {DAMAGE_DICE.map((die) => (
                        <option value={die} key={die}>
                          {die}
                        </option>
                      ))}
                    </RamSelect>
                  </RamField>
                  <RamField label="Damage Type" className="span-all">
                    <RamSelect
                      value={selected.damageType}
                      onChange={(event) =>
                        updateItem(selected.id, { damageType: event.target.value })
                      }
                    >
                      {DAMAGE_TYPES.map((type) => (
                        <option value={type} key={type}>
                          {type[0].toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </RamSelect>
                  </RamField>
                </div>
                <RamField label="Properties">
                  <TagInput
                    values={selected.properties}
                    suggestions={PROPERTY_SUGGESTIONS}
                    ariaLabel="Weapon properties"
                    placeholder="Type or select a property…"
                    onChange={(properties) => updateItem(selected.id, { properties })}
                  />
                </RamField>
              </div>
            )}

            {selected.category === "armor" && (
              <div className="item-detail-group">
                <span className="ram-field__label">Armor Mechanics</span>
                <div className="item-editor-fields">
                  <RamField label="Armor Type">
                    <RamSelect
                      value={selected.equipSlot}
                      onChange={(event) =>
                        updateItem(selected.id, {
                          equipSlot: event.target.value as LibraryItem["equipSlot"],
                        })
                      }
                    >
                      <option value="armor">Worn Armor</option>
                      <option value="shield">Shield</option>
                    </RamSelect>
                  </RamField>
                  {selected.equipSlot === "armor" ? (
                    <>
                      <RamField label="Base Armor Class">
                        <RamInput
                          type="number"
                          min={0}
                          value={selected.armorClass}
                          onChange={(event) =>
                            updateItem(selected.id, {
                              armorClass: Math.max(0, Number(event.target.value)),
                            })
                          }
                        />
                      </RamField>
                      <RamField label="Dexterity Contribution">
                        <RamSelect
                          value={selected.armorDexterity}
                          onChange={(event) =>
                            updateItem(selected.id, {
                              armorDexterity: event.target
                                .value as LibraryItem["armorDexterity"],
                            })
                          }
                        >
                          <option value="none">None</option>
                          <option value="full">Full Dexterity</option>
                          <option value="max2">Dexterity (maximum +2)</option>
                        </RamSelect>
                      </RamField>
                      <RamField label="Strength Required">
                        <RamInput
                          type="number"
                          min={0}
                          value={selected.strengthRequirement}
                          onChange={(event) =>
                            updateItem(selected.id, {
                              strengthRequirement: Math.max(
                                0,
                                Number(event.target.value)
                              ),
                            })
                          }
                        />
                      </RamField>
                      <label className="equip-toggle">
                        <input
                          type="checkbox"
                          checked={selected.stealthDisadvantage}
                          onChange={(event) =>
                            updateItem(selected.id, {
                              stealthDisadvantage: event.target.checked,
                            })
                          }
                        />
                        Stealth disadvantage
                      </label>
                    </>
                  ) : (
                    <RamField label="Armor Bonus">
                      <RamInput
                        type="number"
                        min={0}
                        value={selected.armorBonus}
                        onChange={(event) =>
                          updateItem(selected.id, {
                            armorBonus: Math.max(0, Number(event.target.value)),
                          })
                        }
                      />
                    </RamField>
                  )}
                </div>
              </div>
            )}

            {(selected.category === "gear" || selected.category === "consumable") && (
              <div className="item-detail-group">
                <span className="ram-field__label">Container & Use</span>
                <div className="item-editor-fields">
                  <RamField label="Container">
                    <RamSelect
                      value={selected.containerType}
                      onChange={(event) =>
                        updateItem(selected.id, {
                          containerType: event.target
                            .value as LibraryItem["containerType"],
                        })
                      }
                    >
                      <option value="">Not a container</option>
                      {CONTAINER_TYPES.filter(Boolean).map((type) => (
                        <option value={type} key={type}>
                          {type[0].toUpperCase() + type.slice(1)}
                        </option>
                      ))}
                    </RamSelect>
                  </RamField>
                  <RamField label="Contents">
                    <RamInput
                      value={selected.contents}
                      placeholder="Water, oil, acid…"
                      onChange={(event) =>
                        updateItem(selected.id, { contents: event.target.value })
                      }
                    />
                  </RamField>
                  <RamField label="Capacity">
                    <RamInput
                      value={selected.capacity}
                      placeholder="1 pint"
                      onChange={(event) =>
                        updateItem(selected.id, { capacity: event.target.value })
                      }
                    />
                  </RamField>
                  {selected.category === "gear" && (
                    <RamField label="Equippable">
                      <RamSelect
                        value={selected.equipSlot === "gear" ? "gear" : "none"}
                        onChange={(event) =>
                          updateItem(selected.id, {
                            equipSlot: event.target.value as "none" | "gear",
                          })
                        }
                      >
                        <option value="none">Carried only</option>
                        <option value="gear">Gear slot</option>
                      </RamSelect>
                    </RamField>
                  )}
                </div>
                {selected.category === "gear" && (
                  <RamField label="Contained Items">
                    <TagInput
                      values={selected.contains}
                      suggestions={items
                        .filter((item) => item.id !== selected.id)
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((item) => item.id)}
                      ariaLabel="Contained items"
                      placeholder="Select an item id; append :quantity if needed"
                      onChange={(contains) => updateItem(selected.id, { contains })}
                    />
                  </RamField>
                )}
                <RamField label="Granted Actions">
                  <TagInput
                    values={selected.actions}
                    suggestions={[]}
                    ariaLabel="Granted actions"
                    placeholder="Type an action and press Enter…"
                    onChange={(actions) => updateItem(selected.id, { actions })}
                  />
                </RamField>
              </div>
            )}

            <RamField label="Description">
              <RamTextarea
                value={selected.description}
                placeholder="Concrete appearance, purpose, and mechanical use…"
                onChange={(event) =>
                  updateItem(selected.id, { description: event.target.value })
                }
              />
            </RamField>
          </>
        ) : (
          <div className="token-editor-placeholder">
            Create an item in {CATEGORY_LABELS[category].toLowerCase()} to begin.
          </div>
        )}
      </div>
    </div>
  );
}
