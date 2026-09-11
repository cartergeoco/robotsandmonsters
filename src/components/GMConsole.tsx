import { Brain, Copy, Loader2, MessageCircle, Send, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { generatePCResponse, pendingMemoryCount, summarizeSession } from "../ai";
import { checkOptionsFor, findCheckOption } from "../checks";
import { isActiveTurn } from "../combat";
import { d20FromResult, requestD20Roll } from "../diceRolls";
import { useRAM } from "../store";
import { formatMod } from "../types";
import { FOCUS_CONSOLE_EVENT } from "./QoLHost";
import {
  RamButton,
  RamConfirmDialog,
  RamDialog,
  RamIconButton,
  RamInput,
  RamPanel,
  RamPanelHeader,
  RamSelect,
  RamTextarea,
} from "./ui/RamPrimitives";

const DiceTray = lazy(() =>
  import("./DiceTray").then((module) => ({ default: module.DiceTray }))
);

/** Aged-out console entries required before the digest is regenerated. */
const MEMORY_BATCH = 4;

/**
 * Folds console history that left the verbatim window into the session digest.
 * Runs in the background and never blocks or interrupts a turn.
 */
async function refreshSessionMemory(force = false) {
  const state = useRAM.getState();
  const { settings, log, memory, campaignName } = state;
  if (!settings.memoryEnabled || state.memoryBusy) return;
  const pending = pendingMemoryCount(log, memory, settings.contextWindow);
  if (pending < (force ? 1 : MEMORY_BATCH)) return;
  state.setMemoryBusy(true);
  try {
    const next = await summarizeSession(log, memory, settings, campaignName);
    if (!next) return;
    // The log only grows, but a clear could have landed mid-request.
    const current = useRAM.getState().log;
    if (current[next.coveredCount - 1]?.id !== next.throughLogId) return;
    useRAM.getState().setMemory(next);
  } catch {
    // A failed digest must not disturb play; the next pass tries again.
  } finally {
    useRAM.getState().setMemoryBusy(false);
  }
}

function rollForPC(pcId: string, checkId: string, reason: string): Promise<string> {
  return new Promise((resolve) => {
    const state = useRAM.getState();
    const pc = state.pcs.find((entry) => entry.id === pcId);
    if (!pc) {
      resolve("ERROR|character no longer exists");
      return;
    }
    const option = findCheckOption(
      checkOptionsFor(pc, state.ruleDefinitions, state.customLibraryItems),
      checkId
    );
    if (!option) {
      resolve(`ERROR|unknown check ${checkId}`);
      return;
    }
    requestD20Roll((result) => {
      const d20 = d20FromResult(result);
      const total = d20 + option.modifier;
      const natural = d20 === 20 ? " (natural 20)" : d20 === 1 ? " (natural 1)" : "";
      const live = useRAM.getState();
      live.addLog({
        role: "system",
        author: "Check",
        authorId: pc.id,
        color: pc.color,
        text: `${pc.name} — ${option.shortLabel} ${d20} ${formatMod(option.modifier)} = ${total}${natural}${reason ? ` — ${reason}` : ""}.`,
      });
      live.addTokenFloater({
        creatureId: pc.id,
        title: option.shortLabel.toUpperCase(),
        detail: String(total),
        outcome: d20 === 1 ? "fail" : d20 === 20 ? "success" : "info",
        color: pc.color,
      });
      resolve(
        `ROLL|${option.id}|d20=${d20}|modifier=${formatMod(option.modifier)}|total=${total}${natural}`
      );
    });
  });
}

function MemoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const memory = useRAM((s) => s.memory);
  const memoryBusy = useRAM((s) => s.memoryBusy);
  const memoryEnabled = useRAM((s) => s.settings.memoryEnabled);
  const setMemoryBullets = useRAM((s) => s.setMemoryBullets);
  const clearMemory = useRAM((s) => s.clearMemory);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    if (open) setDraft(useRAM.getState().memory.bullets.join("\n"));
  }, [open]);

  const commit = () => {
    const stored = useRAM.getState().memory.bullets.join("\n");
    if (draft.trim() === stored.trim()) return;
    setMemoryBullets(draft.split("\n"));
  };

  return (
    <RamDialog
      open={open}
      title="Session memory"
      onClose={() => {
        commit();
        onClose();
      }}
    >
      <p className="settings-note">
        {memoryEnabled
          ? "Older console history is condensed into these notes and sent to every character. Correct anything the summary got wrong."
          : "Session memory is switched off in Settings. These notes are kept but not sent."}
      </p>
      <RamTextarea
        aria-label="Session memory notes"
        rows={10}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        placeholder="One remembered fact per line…"
      />
      <div className="settings-ai-actions">
        <RamButton
          size="sm"
          disabled={memoryBusy}
          onClick={() => {
            commit();
            void refreshSessionMemory(true);
          }}
        >
          {memoryBusy ? "Summarizing" : "Summarize now"}
        </RamButton>
        <RamButton
          size="sm"
          variant="danger"
          disabled={memory.bullets.length === 0}
          onClick={() => {
            clearMemory();
            setDraft("");
          }}
        >
          Forget
        </RamButton>
      </div>
    </RamDialog>
  );
}

export function GMConsole() {
  const log = useRAM((s) => s.log);
  const pcs = useRAM((s) => s.pcs);
  const thinking = useRAM((s) => s.thinking);
  const memoryBusy = useRAM((s) => s.memoryBusy);
  const memoryCount = useRAM((s) => s.memory.bullets.length);
  const addLog = useRAM((s) => s.addLog);
  const clearLog = useRAM((s) => s.clearLog);
  const ui = useRAM((s) => s.uiSettings);
  const [draft, setDraft] = useState("");
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [roleFilter, setRoleFilter] = useState<"all" | "gm" | "pc" | "system">("all");
  const [authorFilter, setAuthorFilter] = useState("all");
  const [logQuery, setLogQuery] = useState("");
  const [turnUsage, setTurnUsage] = useState<
    Record<string, { inputTokens: number; loreEntries: number }>
  >({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const visibleLog = useMemo(() => {
    const query = logQuery.trim().toLocaleLowerCase();
    return log.filter(
      (entry) =>
        (roleFilter === "all" || entry.role === roleFilter) &&
        (authorFilter === "all" || entry.authorId === authorFilter) &&
        (!query ||
          entry.author.toLocaleLowerCase().includes(query) ||
          entry.text.toLocaleLowerCase().includes(query))
    );
  }, [authorFilter, log, logQuery, roleFilter]);

  useEffect(() => {
    const focus = () => inputRef.current?.focus();
    window.addEventListener(FOCUS_CONSOLE_EVENT, focus);
    return () => window.removeEventListener(FOCUS_CONSOLE_EVENT, focus);
  }, []);

  useEffect(() => {
    if (!ui.autoScrollConsole) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length, ui.autoScrollConsole]);

  function sendGM() {
    const text = draft.trim();
    if (!text) return;
    addLog({ role: "gm", author: "GM", text });
    setDraft("");
    void refreshSessionMemory();
  }

  async function askPC(pcId: string) {
    const s = useRAM.getState();
    const pc = s.pcs.find((p) => p.id === pcId);
    if (!pc || s.thinking.includes(pcId)) return;
    s.clearPCIntent(pcId);
    s.setThinking(pcId, true);
    try {
      const text = await generatePCResponse({
        pc,
        party: s.pcs,
        log: s.log,
        settings: s.settings,
        rules: s.ruleDefinitions,
        libraryItems: s.customLibraryItems,
        tokens: s.tokens,
        lighting: s.lighting,
        weather: s.weather,
        environments: s.environments,
        activeEnvironmentId: s.activeEnvironmentId,
        memory: s.memory,
        combat: s.combat,
        gameplay: s.gameplaySettings,
        emitIntent: (intent) => {
          const live = useRAM.getState();
          if (live.gameplaySettings.intentBubbles) {
            live.setPCIntent(intent);
          }
          if (!live.gameplaySettings.intentBubbles || intent.autonomy === "announce") {
            live.addLog({
              role: "pc",
              author: pc.name,
              authorId: pc.id,
              color: pc.color,
              text: `*${intent.title}: ${intent.detail}*`,
            });
          }
        },
        say: (message) =>
          useRAM.getState().addLog({
            role: "pc",
            author: pc.name,
            authorId: pc.id,
            color: pc.color,
            text: message,
          }),
        emote: (message) =>
          useRAM.getState().addLog({
            role: "pc",
            author: pc.name,
            authorId: pc.id,
            color: pc.color,
            text: `*${message}*`,
          }),
        updatePC: (patch) => useRAM.getState().updatePC(pc.id, patch),
        getLiveState: () => {
          const live = useRAM.getState();
          return {
            pc: live.pcs.find((entry) => entry.id === pc.id) ?? pc,
            party: live.pcs,
            tokens: live.tokens,
          };
        },
        movePC: (cell) => useRAM.getState().moveCreature(pc.id, true, cell.x, cell.y),
        rollCheck: (checkId, reason) => rollForPC(pc.id, checkId, reason),
        endTurn: () => {
          const live = useRAM.getState();
          if (!isActiveTurn(live.combat, pc.id)) return false;
          live.nextTurn();
          return true;
        },
        onUsageEstimate: (inputTokens, loreEntries) =>
          setTurnUsage((current) => ({
            ...current,
            [pc.id]: { inputTokens, loreEntries },
          })),
      });
      if (text) {
        useRAM.getState().addLog({
          role: "pc",
          author: pc.name,
          authorId: pc.id,
          color: pc.color,
          text,
        });
      }
      void refreshSessionMemory();
    } catch (err) {
      useRAM.getState().addLog({
        role: "system",
        author: "System",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      useRAM.getState().setThinking(pcId, false);
    }
  }

  function clearConsole() {
    if (ui.confirmClearConsole) {
      setConfirmClearOpen(true);
      return;
    }
    clearLog();
  }

  return (
    <>
      <RamPanel className="gm-console">
      <RamPanelHeader
        title="Console"
        actions={
          <>
            <RamIconButton
              label={
                memoryBusy
                  ? "Summarizing session memory"
                  : `Session memory (${memoryCount} note${memoryCount === 1 ? "" : "s"})`
              }
              onClick={() => setMemoryOpen(true)}
            >
              {memoryBusy ? (
                <Loader2 size={16} className="spin" />
              ) : (
                <Brain size={16} strokeWidth={1.5} />
              )}
            </RamIconButton>
            <RamIconButton
              label="Clear console"
              variant="danger"
              disabled={log.length === 0}
              onClick={clearConsole}
            >
              <Trash2 size={16} strokeWidth={1.5} />
            </RamIconButton>
          </>
        }
      />
      <div className="gm-body">
        <div className="console-log-column">
          <div className="console-filters">
            <RamInput
              aria-label="Search console"
              placeholder="Filter messages…"
              value={logQuery}
              onChange={(event) => setLogQuery(event.target.value)}
            />
            <RamSelect
              aria-label="Filter console by type"
              value={roleFilter}
              onChange={(event) =>
                setRoleFilter(event.target.value as typeof roleFilter)
              }
            >
              <option value="all">All types</option>
              <option value="gm">GM</option>
              <option value="pc">Characters</option>
              <option value="system">System & dice</option>
            </RamSelect>
            <RamSelect
              aria-label="Filter console by character"
              value={authorFilter}
              onChange={(event) => setAuthorFilter(event.target.value)}
            >
              <option value="all">All characters</option>
              {pcs.map((pc) => (
                <option value={pc.id} key={pc.id}>{pc.name}</option>
              ))}
            </RamSelect>
          </div>
          <div className="log-scroll" ref={scrollRef}>
          {visibleLog.map((e) => (
            <div className={`log-entry ${e.role}`} key={e.id}>
              <span className="log-copy">
                <span
                  className="log-author"
                  style={e.color ? { color: e.color } : undefined}
                >
                  {e.author === "RAM" ? "System" : e.author}
                  <time>
                    {new Date(e.ts).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                      hour12:
                        ui.timeFormat === "12-hour"
                          ? true
                          : ui.timeFormat === "24-hour"
                            ? false
                            : undefined,
                    })}
                  </time>
                </span>
                <span className="log-text">{e.text}</span>
              </span>
              <RamIconButton
                className="log-copy-button"
                label={`Copy message from ${e.author}`}
                onClick={() => void navigator.clipboard.writeText(e.text)}
              >
                <Copy size={13} strokeWidth={1.5} />
              </RamIconButton>
            </div>
          ))}
          {visibleLog.length === 0 && (
            <span className="token-catalog-empty">No console messages match.</span>
          )}
          </div>
        </div>
        <div className="gm-side">
          <span className="gm-side__label">Ask a character</span>
          {pcs.length === 0 && (
            <span className="gm-side__empty">
              Add a character first.
            </span>
          )}
          {pcs.map((pc) => {
            const busy = thinking.includes(pc.id);
            return (
              <button
                key={pc.id}
                className="player-action"
                disabled={busy}
                onClick={() => askPC(pc.id)}
              >
                {busy ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <span className="player-action__avatar" style={{ color: pc.color }}>
                    {pc.portrait ? (
                      <img src={pc.portrait} alt="" />
                    ) : (
                      pc.name.slice(0, 1).toUpperCase()
                    )}
                  </span>
                )}
                <span className="player-action__name">{pc.name}</span>
                {turnUsage[pc.id] && (
                  <small
                    className="player-action__usage"
                    title={`${turnUsage[pc.id].loreEntries} context lookups`}
                  >
                    ~{turnUsage[pc.id].inputTokens.toLocaleString()} in
                  </small>
                )}
                <MessageCircle
                  className="player-action__indicator"
                  size={14}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="gm-input-row">
        <Suspense fallback={null}>
          <DiceTray motion={ui.motion} />
        </Suspense>
        <div className="command-field">
          <RamInput
            ref={inputRef}
            placeholder="Describe what happens…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") sendGM();
            }}
          />
          <RamIconButton label="Send to console" variant="brass" onClick={sendGM}>
            <Send size={16} strokeWidth={1.5} />
          </RamIconButton>
        </div>
      </div>
      </RamPanel>
      <MemoryDialog open={memoryOpen} onClose={() => setMemoryOpen(false)} />
      <RamConfirmDialog
        open={confirmClearOpen}
        title="Clear console?"
        description="Every console message and the session memory will be removed. This cannot be undone."
        confirmLabel="Clear"
        onConfirm={clearLog}
        onClose={() => setConfirmClearOpen(false)}
      />
    </>
  );
}
