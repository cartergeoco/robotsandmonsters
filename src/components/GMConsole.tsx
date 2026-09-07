import { Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { generatePCResponse } from "../ai";
import { useRAM } from "../store";
import { rollDie } from "../util";

const DICE = [4, 6, 8, 10, 12, 20, 100];

export function GMConsole() {
  const log = useRAM((s) => s.log);
  const pcs = useRAM((s) => s.pcs);
  const thinking = useRAM((s) => s.thinking);
  const addLog = useRAM((s) => s.addLog);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log.length]);

  function sendGM() {
    const text = draft.trim();
    if (!text) return;
    addLog({ role: "gm", author: "GM", text });
    setDraft("");
  }

  async function askPC(pcId: string) {
    const s = useRAM.getState();
    const pc = s.pcs.find((p) => p.id === pcId);
    if (!pc || s.thinking.includes(pcId)) return;
    s.setThinking(pcId, true);
    try {
      const text = await generatePCResponse(pc, s.pcs, s.log, s.settings);
      useRAM.getState().addLog({
        role: "pc",
        author: pc.name,
        authorId: pc.id,
        color: pc.color,
        text,
      });
    } catch (err) {
      useRAM.getState().addLog({
        role: "system",
        author: "RAM",
        text: err instanceof Error ? err.message : String(err),
      });
    } finally {
      useRAM.getState().setThinking(pcId, false);
    }
  }

  function roll(sides: number) {
    addLog({
      role: "system",
      author: "Dice",
      text: `d${sides} → ${rollDie(sides)}`,
    });
  }

  return (
    <div className="panel gm-console">
      <div className="gm-body">
        <div className="log-scroll" ref={scrollRef}>
          {log.map((e) => (
            <div className={`log-entry ${e.role}`} key={e.id}>
              <span
                className="log-author"
                style={e.color ? { color: e.color } : undefined}
              >
                {e.author}
              </span>
              <span className="log-text">{e.text}</span>
            </div>
          ))}
        </div>
        <div className="gm-side">
          <span className="gm-side-title">Prompt a player</span>
          {pcs.length === 0 && (
            <span style={{ fontSize: 11, color: "var(--text-faint)" }}>
              Create a character first.
            </span>
          )}
          {pcs.map((pc) => {
            const busy = thinking.includes(pc.id);
            return (
              <button
                key={pc.id}
                className="ask-btn"
                disabled={busy}
                onClick={() => askPC(pc.id)}
              >
                {busy ? (
                  <Loader2 size={13} className="spin" />
                ) : (
                  <MessageSquare size={13} style={{ color: pc.color }} />
                )}
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pc.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="gm-input-row">
        <div className="dice-row">
          {DICE.map((d) => (
            <button className="dice-btn" key={d} onClick={() => roll(d)}>
              d{d}
            </button>
          ))}
        </div>
        <input
          placeholder="Narrate the scene as GM…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendGM();
          }}
        />
        <button className="send-btn" onClick={sendGM} title="Send">
          <Send size={14} />
        </button>
      </div>
    </div>
  );
}
