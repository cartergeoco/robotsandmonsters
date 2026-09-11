import { useEffect } from "react";
import { setSceneMix, unlockSceneAudio } from "../sceneAudio";
import { setWeatherMix } from "../weatherAudio";
import { useRAM } from "../store";

export function SceneAudioHost() {
  const music = useRAM((state) => state.music);
  const ambience = useRAM((state) => state.ambience);
  const weather = useRAM((state) => state.weather);
  const sceneTransition = useRAM((state) => state.sceneTransition);
  const weatherTransition = useRAM((state) => state.weatherTransition);
  const ui = useRAM((state) => state.uiSettings);
  const inCombat = useRAM((state) => state.combat !== null);
  const battleTrack = useRAM(
    (state) => state.battleMusic ?? state.defaultBattleMusic
  );
  const combatMusicEnabled = useRAM(
    (state) => state.gameplaySettings.combatMusicEnabled
  );

  /**
   * Battle music replaces the music layer rather than stacking on it, which
   * reuses the existing crossfade and leaves ambience and weather running.
   * With no battle track configured, the scene's own music keeps playing.
   */
  const activeMusic =
    inCombat && combatMusicEnabled && battleTrack ? battleTrack : music;

  useEffect(() => {
    const onInteract = () => unlockSceneAudio();
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener("pointerdown", onInteract, opts);
    window.addEventListener("keydown", onInteract, opts);
    window.addEventListener("touchstart", onInteract, opts);
    return () => {
      window.removeEventListener("pointerdown", onInteract, opts);
      window.removeEventListener("keydown", onInteract, opts);
      window.removeEventListener("touchstart", onInteract, opts);
    };
  }, []);

  useEffect(() => {
    const master = ui.masterMuted ? 0 : (ui.masterVolume ?? 100) / 100;
    const fadeMs = sceneTransition
      ? Math.max(80, sceneTransition.durationMs)
      : ui.motion === "reduced"
        ? 80
        : 900;
    void setSceneMix({
      music: activeMusic,
      ambience,
      musicMaster: master * (ui.musicVolume ?? 70) / 100,
      ambienceMaster: master * (ui.ambienceVolume ?? 80) / 100,
      fadeMs,
    });
  }, [activeMusic, ambience, sceneTransition, ui.masterMuted, ui.masterVolume, ui.musicVolume, ui.ambienceVolume, ui.motion]);

  useEffect(() => {
    const master = ui.masterMuted ? 0 : (ui.masterVolume ?? 100) / 100;
    const fadeMs = weatherTransition
      ? Math.max(80, weatherTransition.durationMs)
      : ui.motion === "reduced"
        ? 80
        : 900;
    void setWeatherMix({
      weather,
      master: master * (ui.sfxVolume ?? 80) / 100,
      fadeMs,
    });
  }, [weather, weatherTransition, ui.masterMuted, ui.masterVolume, ui.sfxVolume, ui.motion]);

  return null;
}
