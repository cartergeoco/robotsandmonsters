export const OPEN_SHORTCUTS_EVENT = "ram:open-shortcuts";

let pendingSettingsTab: "about" | null = null;

export function requestShortcutsTab() {
  pendingSettingsTab = "about";
  window.dispatchEvent(new Event(OPEN_SHORTCUTS_EVENT));
}

export function consumePendingSettingsTab() {
  const tab = pendingSettingsTab;
  pendingSettingsTab = null;
  return tab;
}

export const SHORTCUTS = [
  ["Ctrl + Z", "Undo the last campaign change"],
  ["Ctrl + Y / Ctrl + Shift + Z", "Redo the last undone change"],
  ["Ctrl + K", "Focus the GM console"],
  ["Ctrl + L", "Open the library"],
  ["Ctrl + ,", "Open settings"],
  ["Shift/Ctrl + click", "Add or remove a map token from the selection"],
  ["Drag empty map", "Marquee-select map tokens"],
  ["Arrow keys", "Move selected map tokens one cell"],
  ["Space", "Center the map on selected tokens"],
  ["N", "End the current turn during combat"],
  ["Delete", "Delete selected map tokens"],
  ["?", "Open the About page in Settings"],
  ["Esc", "Close the active dialog or panel"],
] as const;
