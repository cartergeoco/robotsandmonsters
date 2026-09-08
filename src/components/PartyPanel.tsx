import { ChevronsUp, Plus } from "lucide-react";
import { useRAM } from "../store";
import {
  RamCharacterCard,
  RamIconButton,
  RamPanel,
  RamPanelBody,
  RamPanelHeader,
} from "./ui/RamPrimitives";

export function PartyPanel() {
  const pcs = useRAM((s) => s.pcs);
  const selectedPcId = useRAM((s) => s.selectedPcId);
  const selectPC = useRAM((s) => s.selectPC);
  const addPC = useRAM((s) => s.addPC);
  const levelUpParty = useRAM((s) => s.levelUpParty);

  return (
    <RamPanel className="party-panel">
      <RamPanelHeader
        title="Party"
        actions={
          <>
            <RamIconButton
              label="Level up every party member"
              onClick={levelUpParty}
              disabled={pcs.length === 0}
            >
              <ChevronsUp size={18} strokeWidth={1.5} />
            </RamIconButton>
            <RamIconButton label="Add character" onClick={() => addPC()}>
              <Plus size={18} strokeWidth={1.5} />
            </RamIconButton>
          </>
        }
      />
      <RamPanelBody>
        {pcs.length === 0 && (
          <div className="empty-hint">
            <span>No characters yet.</span>
          </div>
        )}
        <div className="party-list">
          {pcs.map((pc) => (
            <RamCharacterCard
              key={pc.id}
              name={pc.name}
              meta={[pc.race, pc.className, `AC ${pc.ac}`].filter(Boolean).join("  ")}
              level={pc.level}
              hp={pc.hp}
              maxHp={pc.maxHp}
              selected={pc.id === selectedPcId}
              onClick={() => selectPC(pc.id === selectedPcId ? null : pc.id)}
            />
          ))}
        </div>
      </RamPanelBody>
    </RamPanel>
  );
}
