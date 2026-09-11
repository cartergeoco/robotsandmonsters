import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type UnsavedController = {
  dirty: boolean;
  save: () => void;
  discard: () => void;
};

type LeaveAction = { run: () => void };

type LibraryUnsavedContextValue = {
  register: (controller: UnsavedController | null) => void;
  requestLeave: (next: () => void) => void;
};

const LibraryUnsavedContext = createContext<LibraryUnsavedContextValue | null>(null);

export function useUnsavedLeave() {
  const controllerRef = useRef<UnsavedController | null>(null);
  const pendingRef = useRef<LeaveAction | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState<LeaveAction | null>(null);
  pendingRef.current = pending;

  const register = useCallback((controller: UnsavedController | null) => {
    controllerRef.current = controller;
    setDirty(Boolean(controller?.dirty));
  }, []);

  const requestLeave = useCallback((next: () => void) => {
    if (!controllerRef.current?.dirty) {
      next();
      return;
    }
    setPending({ run: next });
  }, []);

  const saveAndLeave = useCallback(() => {
    const leave = pendingRef.current;
    controllerRef.current?.save();
    setPending(null);
    leave?.run();
  }, []);

  const discardAndLeave = useCallback(() => {
    const leave = pendingRef.current;
    controllerRef.current?.discard();
    setPending(null);
    leave?.run();
  }, []);

  const cancelLeave = useCallback(() => setPending(null), []);

  const save = useCallback(() => {
    controllerRef.current?.save();
  }, []);

  return {
    dirty,
    pending,
    register,
    requestLeave,
    save,
    saveAndLeave,
    discardAndLeave,
    cancelLeave,
  };
}

export function LibraryUnsavedProvider({
  register,
  requestLeave,
  children,
}: {
  register: (controller: UnsavedController | null) => void;
  requestLeave: (next: () => void) => void;
  children: ReactNode;
}) {
  const value = useMemo(
    () => ({ register, requestLeave }),
    [register, requestLeave]
  );
  return (
    <LibraryUnsavedContext.Provider value={value}>
      {children}
    </LibraryUnsavedContext.Provider>
  );
}

export function useLibraryUnsaved() {
  const ctx = useContext(LibraryUnsavedContext);
  return {
    requestLeave: ctx?.requestLeave ?? ((next: () => void) => next()),
  };
}

export function useRegisterUnsaved(dirty: boolean, save: () => void, discard: () => void) {
  const ctx = useContext(LibraryUnsavedContext);
  const saveRef = useRef(save);
  const discardRef = useRef(discard);
  saveRef.current = save;
  discardRef.current = discard;

  useEffect(() => {
    if (!ctx) return;
    ctx.register({
      dirty,
      save: () => saveRef.current(),
      discard: () => discardRef.current(),
    });
    return () => ctx.register(null);
  }, [ctx, dirty]);
}

export function LibraryUnsavedHost({
  dirty,
  save,
  discard,
}: {
  dirty: boolean;
  save: () => void;
  discard: () => void;
}) {
  useRegisterUnsaved(dirty, save, discard);
  return null;
}
