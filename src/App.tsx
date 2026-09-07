import { CharacterSheet } from "./components/CharacterSheet";
import { EnvironmentPanel } from "./components/EnvironmentPanel";
import { GMConsole } from "./components/GMConsole";
import { MapCanvas } from "./components/MapCanvas";
import { PartyPanel } from "./components/PartyPanel";
import { SettingsModal } from "./components/SettingsModal";
import { TopBar } from "./components/TopBar";

export default function App() {
  return (
    <div className="app">
      <MapCanvas />
      <TopBar />
      <PartyPanel />
      <CharacterSheet />
      <EnvironmentPanel />
      <GMConsole />
      <SettingsModal />
    </div>
  );
}
