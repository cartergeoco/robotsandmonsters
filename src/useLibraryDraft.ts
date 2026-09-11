import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useLibraryDraft<T extends { id: string }>(
  stored: T | undefined,
  persist: (value: T) => void
) {
  const [draft, setDraft] = useState<T | undefined>(stored);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const persistRef = useRef(persist);
  persistRef.current = persist;
  const storedRef = useRef(stored);
  storedRef.current = stored;

  useEffect(() => {
    const current = draftRef.current;
    if (!stored) {
      setDraft(undefined);
      return;
    }
    if (!current || current.id !== stored.id) setDraft(stored);
  }, [stored]);

  const dirty = useMemo(() => {
    if (!draft || !stored || draft.id !== stored.id) return false;
    return JSON.stringify(draft) !== JSON.stringify(stored);
  }, [draft, stored]);

  function patch(partial: Partial<T>) {
    setDraft((current) => (current ? { ...current, ...partial } : current));
  }

  const save = useCallback(() => {
    const current = draftRef.current;
    if (!current) return;
    persistRef.current(current);
  }, []);

  const discard = useCallback(() => {
    setDraft(storedRef.current);
  }, []);

  return { draft, dirty, patch, save, discard, setDraft };
}
