import type { CSSProperties, ReactNode } from "react";
import {
  ITEM_RARITY_COLORS,
  normalizeItemRarity,
  type Item,
  type ItemRarity,
  type LibraryItem,
} from "../types";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function itemRarityClassName(rarity: unknown): string {
  const value = normalizeItemRarity(rarity);
  return value === "common" ? "" : `item-name--${value}`;
}

export function rarityOfLibraryItem(
  item: Pick<LibraryItem, "rarity"> | undefined
): ItemRarity {
  return normalizeItemRarity(item?.rarity);
}

export function rarityOfCarriedItem(
  item: Pick<Item, "libraryItemId">,
  libraryItems: LibraryItem[]
): ItemRarity {
  return rarityOfLibraryItem(
    libraryItems.find((entry) => entry.id === item.libraryItemId)
  );
}

export function itemRarityStyle(rarity: unknown): CSSProperties | undefined {
  const value = normalizeItemRarity(rarity);
  if (value === "common") return undefined;
  return {
    color: ITEM_RARITY_COLORS[value],
    ...(value === "artifact"
      ? {
          fontFamily:
            'Palatino, "Palatino Linotype", "Book Antiqua", Georgia, serif',
        }
      : {}),
  };
}

export function ItemName({
  name,
  rarity,
  className,
  children,
}: {
  name?: string;
  rarity?: unknown;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={cx("item-name", itemRarityClassName(rarity), className)}>
      {children ?? name}
    </span>
  );
}
