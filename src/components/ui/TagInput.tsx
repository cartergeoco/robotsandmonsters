import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";

export function TagInput({
  values,
  suggestions,
  onChange,
  placeholder = "Add tag…",
  allowCustom = true,
  max,
  ariaLabel = "Tags",
}: {
  values: string[];
  suggestions: readonly string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  allowCustom?: boolean;
  max?: number;
  ariaLabel?: string;
}) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const available = suggestions
    .filter(
      (suggestion) =>
        !values.some((value) => value.toLowerCase() === suggestion.toLowerCase())
    )
    .sort((a, b) => a.localeCompare(b));
  const atLimit = max !== undefined && values.length >= max;

  function add(rawValue: string) {
    const trimmed = rawValue.trim();
    if (!trimmed || atLimit) return;
    const suggestion = suggestions.find(
      (candidate) => candidate.toLowerCase() === trimmed.toLowerCase()
    );
    if (!suggestion && !allowCustom) return;
    const next = suggestion ?? trimmed;
    if (values.some((value) => value.toLowerCase() === next.toLowerCase())) {
      setDraft("");
      return;
    }
    onChange([...values, next]);
    setDraft("");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      add(draft);
    } else if (event.key === "Backspace" && !draft && values.length > 0) {
      onChange(values.slice(0, -1));
    }
  }

  return (
    <div className="tag-input" aria-label={ariaLabel}>
      <div className="tag-input__well">
        {values.map((value) => (
          <span className="tag-chip" key={value}>
            {value}
            <button
              type="button"
              aria-label={`Remove ${value}`}
              onClick={() => onChange(values.filter((entry) => entry !== value))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {!atLimit && allowCustom && (
          <input
            value={draft}
            list={listId}
            placeholder={values.length ? "Add…" : placeholder}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
          />
        )}
        {allowCustom && (
          <datalist id={listId}>
            {available.map((suggestion) => (
              <option value={suggestion} key={suggestion} />
            ))}
          </datalist>
        )}
      </div>
      {!atLimit && available.length > 0 && (
        <select
          className="tag-input__browse"
          value=""
          aria-label={`Add ${ariaLabel.toLowerCase()} from list`}
          onChange={(event) => add(event.target.value)}
        >
          <option value="">Add from list…</option>
          {available.map((suggestion) => (
            <option value={suggestion} key={suggestion}>
              {suggestion}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
