import { Upload, X } from "lucide-react";
import { useRef } from "react";
import { fileToDataURL } from "../util";
import { RamIconButton, RamSection } from "./ui/RamPrimitives";

export function PortraitField({
  name,
  portrait,
  disabled = false,
  onChange,
}: {
  name: string;
  portrait?: string;
  disabled?: boolean;
  onChange: (portrait: string | undefined) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <RamSection title="Portrait">
      <div className="portrait-field">
        <div className={`portrait-frame${portrait ? " has-image" : ""}`}>
          {portrait ? (
            <img src={portrait} alt={`${name} portrait`} />
          ) : (
            <span>{name.slice(0, 1).toUpperCase() || "?"}</span>
          )}
        </div>
        <div className="portrait-field__actions">
          {!disabled && (
            <RamIconButton
              label={portrait ? `Replace ${name} portrait` : `Upload ${name} portrait`}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} strokeWidth={1.5} />
            </RamIconButton>
          )}
          {!disabled && portrait && (
            <RamIconButton
              label={`Remove ${name} portrait`}
              variant="danger"
              onClick={() => onChange(undefined)}
            >
              <X size={15} strokeWidth={1.5} />
            </RamIconButton>
          )}
          <small>Separate from the map token.</small>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (file) onChange(await fileToDataURL(file));
            event.target.value = "";
          }}
        />
      </div>
    </RamSection>
  );
}
