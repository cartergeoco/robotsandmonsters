import { BedDouble, ChevronsUp, Coffee, Plus } from "lucide-react";
import { deathConditionLabel } from "../deathSaves";
import { useRAM } from "../store";
import { activeCreatureSheen } from "../types";
import {
  RamButton,
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
  const shortRestParty = useRAM((s) => s.shortRestParty);
  const fullRestParty = useRAM((s) => s.fullRestParty);
  const creatureSheens = useRAM((s) => s.creatureSheens);

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
        <div className="party-rest-bar">
          <RamButton
            size="sm"
            icon={Coffee}
            disabled={pcs.length === 0}
            onClick={shortRestParty}
          >
            Short rest
          </RamButton>
          <RamButton
            size="sm"
            icon={BedDouble}
            disabled={pcs.length === 0}
            onClick={fullRestParty}
          >
            Full rest
          </RamButton>
        </div>
        {pcs.length === 0 && (
          <div className="empty-hint">
            <span>No characters yet.</span>
          </div>
        )}
        <div className="party-list">
          {pcs.map((pc) => {
            const sheen = activeCreatureSheen(pc.id, creatureSheens);
            return (
              <RamCharacterCard
                key={pc.id}
                name={pc.name}
                meta={[pc.race, pc.className, `AC ${pc.ac}`].filter(Boolean).join("  ")}
                level={pc.level}
                hp={pc.hp}
                maxHp={pc.maxHp}
                condition={deathConditionLabel(pc)}
                selected={pc.id === selectedPcId}
                sheen={sheen ? { id: sheen.id, kind: sheen.kind } : null}
                onClick={() => selectPC(pc.id === selectedPcId ? null : pc.id)}
              />
            );
          })}
        </div>
      </RamPanelBody>
    </RamPanel>
  );
}
