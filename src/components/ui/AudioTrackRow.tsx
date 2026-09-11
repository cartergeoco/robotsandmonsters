import { X } from "lucide-react";
import { useRef, type ComponentType } from "react";
import {
  DEFAULT_TRACK_VOLUME,
  normalizeTrackVolume,
  type EnvironmentTrack,
} from "../../types";
import { fileToDataURL } from "../../util";
import { RamField, RamIconButton } from "./RamPrimitives";

interface AudioTrackRowProps {
  label: string;
  icon: ComponentType<{ size?: number; strokeWidth?: number }>;
  track: EnvironmentTrack | null;
  onChange: (track: EnvironmentTrack | null) => void;
  /** Called before the picker reads a file, so hosts can unlock audio. */
  onPick?: () => void;
  hint?: string;
  /** `row` matches the scene panel's compact list; `field` matches form layouts. */
  variant?: "row" | "field";
}

export function AudioTrackRow({
  label,
  icon: Icon,
  track,
  onChange,
  onPick,
  hint,
  variant = "row",
}: AudioTrackRowProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const noun = label.toLowerCase();

  const controls = (
    <span className="env-audio-row__controls">
      <RamIconButton
        label={track ? `Replace ${noun}` : `Upload ${noun}`}
        onClick={() => {
          onPick?.();
          fileRef.current?.click();
        }}
      >
        <Icon size={16} strokeWidth={1.5} />
      </RamIconButton>
      {track && (
        <RamIconButton
          label={`Remove ${noun}`}
          variant="danger"
          onClick={() => onChange(null)}
        >
          <X size={15} strokeWidth={1.5} />
        </RamIconButton>
      )}
    </span>
  );

  const picker = (
    <input
      ref={fileRef}
      type="file"
      accept="audio/*"
      hidden
      onChange={async (event) => {
        const file = event.target.files?.[0];
        if (file) {
          onChange({
            src: await fileToDataURL(file),
            volume: track?.volume ?? DEFAULT_TRACK_VOLUME,
          });
        }
        event.target.value = "";
      }}
    />
  );

  const volume = track ? (
    <label className={variant === "row" ? "bg-scale env-audio-volume" : "bg-scale"}>
      <span>Vol</span>
      <input
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={track.volume}
        aria-label={`${label} volume`}
        onChange={(event) =>
          onChange({
            ...track,
            volume: normalizeTrackVolume(Number(event.target.value)),
          })
        }
      />
      <span>{Math.round(track.volume * 100)}%</span>
    </label>
  ) : (
    <span className="empty-inline">None</span>
  );

  if (variant === "field") {
    return (
      <RamField label={label} hint={hint}>
        {controls}
        {picker}
        {volume}
      </RamField>
    );
  }

  return (
    <div className="env-audio-row">
      <span className="ram-eyebrow">{label}</span>
      {controls}
      {picker}
      {volume}
    </div>
  );
}
