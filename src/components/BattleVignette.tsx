import { createPortal } from "react-dom";
import { useRAM } from "../store";

/**
 * Full-viewport red edge tint that marks battle mode. Rendered into the body
 * rather than the map canvas so it frames the panels and console too.
 */
export function BattleVignette() {
  const inCombat = useRAM((state) => state.combat !== null);
  const enabled = useRAM((state) => state.gameplaySettings.combatVignette);
  if (!inCombat || !enabled) return null;
  return createPortal(
    <div className="battle-vignette" aria-hidden="true" />,
    document.body
  );
}
