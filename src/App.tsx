import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import { BattleVignette } from "./components/BattleVignette";
import { CharacterSheet } from "./components/CharacterSheet";
import { EnvironmentPanel } from "./components/EnvironmentPanel";
import { GMConsole } from "./components/GMConsole";
import { MapCanvas } from "./components/MapCanvas";
import { PartyPanel } from "./components/PartyPanel";
import { QoLHost } from "./components/QoLHost";
import { SceneAudioHost } from "./components/SceneAudioHost";
import { TopBar } from "./components/TopBar";
import { TurnTracker } from "./components/TurnTracker";
import { PALETTE_SCHEME } from "./types";
import { useRAM } from "./store";

const SettingsModal = lazy(() =>
  import("./components/SettingsModal").then((module) => ({
    default: module.SettingsModal,
  }))
);
const TokenManager = lazy(() =>
  import("./components/TokenManager").then((module) => ({
    default: module.TokenManager,
  }))
);

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
    delete root.dataset.theme;
    root.dataset.palette = ui.palette;
    root.dataset.textScale = ui.textScale;
    root.dataset.density = ui.density;
    root.dataset.motion = ui.motion;
    root.dataset.transparency = ui.reducedTransparency ? "reduced" : "standard";
    root.dataset.contrast = ui.increasedContrast ? "increased" : "standard";
    root.dataset.focus = ui.enhancedFocus ? "enhanced" : "standard";
    root.style.colorScheme = PALETTE_SCHEME[ui.palette] ?? "dark";
  }, [ui]);

  useEffect(() => {
    document.title = activeView === "world-map" ? "World Map | RAM" : "Board | RAM";
  }, [activeView]);

  if (!hydrated) {
    return <div className="app" aria-busy="true" />;
  }

  return (
    <div className="app">
      <SceneAudioHost />
      <QoLHost />
      <TopBar />
      {activeView === "grid" ? (
        <>
          <MapCanvas />
          <TurnTracker />
          <BattleVignette />
          <PartyPanel />
          <CharacterSheet />
          <EnvironmentPanel />
          <GMConsole />
          <Suspense fallback={null}>
            <TokenManager />
          </Suspense>
        </>
      ) : (
        <main className="world-map-page" aria-label="World map — work in progress" />
      )}
      <Suspense fallback={null}>
        <SettingsModal />
      </Suspense>
    </div>
  );
}
