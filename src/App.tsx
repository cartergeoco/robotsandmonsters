import { useEffect, useLayoutEffect, useState } from "react";
import { CharacterSheet } from "./components/CharacterSheet";
import { EnvironmentPanel } from "./components/EnvironmentPanel";
import { GMConsole } from "./components/GMConsole";
import { MapCanvas } from "./components/MapCanvas";
import { PartyPanel } from "./components/PartyPanel";
import { SettingsModal } from "./components/SettingsModal";
import { TokenManager } from "./components/TokenManager";
import { TopBar } from "./components/TopBar";
import { useRAM } from "./store";

export default function App() {
  const ui = useRAM((state) => state.uiSettings);
  const activeView = useRAM((state) => state.activeView);
  const [hydrated, setHydrated] = useState(() => useRAM.persist.hasHydrated());

  useEffect(() => {
    const unsub = useRAM.persist.onFinishHydration(() => setHydrated(true));
    if (useRAM.persist.hasHydrated()) setHydrated(true);
    const fallback = window.setTimeout(() => setHydrated(true), 2500);
    return () => {
      unsub();
      window.clearTimeout(fallback);
    };
  }, []);

  useLayoutEffect(() => {
    const root = document.documentElement;
    const media = window.matchMedia("(prefers-color-scheme: light)");

    const apply = () => {
      const theme = ui.theme === "system" ? (media.matches ? "light" : "dark") : ui.theme;
      root.dataset.theme = theme;
      root.dataset.palette = ui.palette;
      root.dataset.textScale = ui.textScale;
      root.dataset.density = ui.density;
      root.dataset.motion = ui.motion;
      root.dataset.transparency = ui.reducedTransparency ? "reduced" : "standard";
      root.dataset.contrast = ui.increasedContrast ? "increased" : "standard";
      root.dataset.focus = ui.enhancedFocus ? "enhanced" : "standard";
      root.style.colorScheme = theme;
    };

    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [ui]);

  if (!hydrated) {
    return <div className="app" aria-busy="true" />;
  }

  return (
    <div className="app">
      <TopBar />
      {activeView === "grid" ? (
        <>
          <MapCanvas />
          <PartyPanel />
          <CharacterSheet />
          <EnvironmentPanel />
          <GMConsole />
          <TokenManager />
        </>
      ) : (
        <main className="world-map-page" aria-label="World map — work in progress" />
      )}
      <SettingsModal />
    </div>
  );
}
