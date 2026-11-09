import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { definePluginApp, useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type { Entry, HistoryItem, rpcContract } from "./server";

const PRESETS = [
  { id: "apple", label: "On-device", hint: "Apple model, free & private" },
  { id: "haiku", label: "Haiku", hint: "cheapest" },
  { id: "sonnet", label: "Sonnet", hint: "smarter" },
  { id: "opus", label: "Opus", hint: "deepest" },
];

const CSS = `
@keyframes lk-rise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
@keyframes lk-pulse { 0%,100% { opacity: .25; transform: scale(.8); } 50% { opacity: 1; transform: scale(1); } }
@keyframes lk-fade { from { opacity: 0; } to { opacity: 1; } }
.lk-root { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 32px; gap: 28px; animation: lk-fade .6s ease both; }
.lk-box { width: min(640px, 100%); display: flex; flex-direction: column; gap: 10px; }
.lk-input { width: 100%; resize: none; border-radius: 18px; border: 1px solid color-mix(in srgb, currentColor 14%, transparent); background: color-mix(in srgb, currentColor 4%, transparent); color: inherit; font: inherit; font-size: 17px; line-height: 1.5; padding: 18px 22px; outline: none; transition: border-color .25s, box-shadow .25s, transform .25s, background .25s; }
.lk-input:focus { border-color: color-mix(in srgb, currentColor 40%, transparent); box-shadow: 0 8px 40px -12px color-mix(in srgb, currentColor 30%, transparent); transform: translateY(-2px); }
.lk-bar { display: flex; justify-content: space-between; align-items: center; font-size: 12px; opacity: .55; padding: 0 6px; transition: opacity .2s; }
.lk-bar:hover { opacity: 1; }
.lk-model { display: flex; gap: 4px; }
.lk-chip { border: 0; background: transparent; color: inherit; font: inherit; padding: 4px 10px; border-radius: 999px; cursor: pointer; opacity: .6; transition: background .2s, opacity .2s, transform .15s; }
.lk-chip:hover { opacity: 1; transform: translateY(-1px); }
.lk-chip[data-on="true"] { background: color-mix(in srgb, currentColor 14%, transparent); opacity: 1; }
.lk-card { width: min(640px, 100%); animation: lk-rise .5s cubic-bezier(.2,.8,.2,1) both; display: flex; flex-direction: column; gap: 12px; }
.lk-term { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; opacity: .5; }
.lk-meaning { font-size: 22px; line-height: 1.4; font-weight: 500; }
.lk-ex { padding-left: 14px; border-left: 2px solid color-mix(in srgb, currentColor 20%, transparent); opacity: .75; font-style: italic; animation: lk-rise .5s cubic-bezier(.2,.8,.2,1) both; }
.lk-dots { display: flex; gap: 6px; height: 26px; align-items: center; }
.lk-dots i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; animation: lk-pulse 1s ease-in-out infinite; }
.lk-dots i:nth-child(2) { animation-delay: .15s; } .lk-dots i:nth-child(3) { animation-delay: .3s; }
.lk-err { opacity: .7; animation: lk-rise .4s ease both; }
.lk-hist { height: 100%; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 2px; }
.lk-hrow { display: flex; align-items: flex-start; gap: 6px; border-radius: 10px; padding: 8px 10px; cursor: pointer; transition: background .2s, transform .2s; animation: lk-rise .35s cubic-bezier(.2,.8,.2,1) both; }
.lk-hrow:hover { background: color-mix(in srgb, currentColor 8%, transparent); transform: translateX(2px); }
.lk-hmain { flex: 1; min-width: 0; }
.lk-hterm { font-weight: 600; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lk-hmean { font-size: 12px; opacity: .55; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lk-x { border: 0; background: transparent; color: inherit; opacity: 0; cursor: pointer; font-size: 14px; transition: opacity .2s; }
.lk-hrow:hover .lk-x { opacity: .5; } .lk-x:hover { opacity: 1 !important; }
.lk-hclear { margin: 8px auto 0; font-size: 11px; opacity: .4; border: 0; background: transparent; color: inherit; cursor: pointer; } .lk-hclear:hover { opacity: .9; }
.lk-hint { font-size: 13px; opacity: .4; }
`;

function Lookup() {
  const rpc = useRpc<typeof rpcContract>();
  const [text, setText] = useState("");
  const [entry, setEntry] = useState<Entry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [model, setModel] = useState("");
  const [shown, setShown] = useState(0); // result key to replay animation
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    rpc.call("get_model").then((r) => setModel(r.model), () => {});
    ref.current?.focus();
  }, [rpc]);

  async function submit() {
    if (!text.trim() || loading) return;
    setLoading(true);
    setError(null);
    setEntry(null);
    try {
      setEntry(await rpc.call("lookup", { text }));
      setShown((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  useEffect(() => {
    const onSelect = (e: Event) => {
      setEntry((e as CustomEvent<Entry>).detail);
      setError(null);
      setShown((n) => n + 1);
    };
    window.addEventListener("lookup-select", onSelect);
    return () => window.removeEventListener("lookup-select", onSelect);
  }, []);

  async function pick(id: string) {
    setModel(id);
    await rpc.call("set_model", { model: id }).catch(() => {});
  }

  return (
    <div className="lk-root">
      <style>{CSS}</style>
      <div className="lk-box">
        <textarea
          ref={ref}
          className="lk-input"
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKey}
          placeholder={'He was "nonplussed" by the news…'}
        />
        <div className="lk-bar">
          <span>Enter to look up</span>
          <div className="lk-model">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                className="lk-chip"
                data-on={model === p.id}
                title={p.hint}
                onClick={() => void pick(p.id)}
              >
                {p.label}
              </button>
            ))}
            {model && !PRESETS.some((p) => p.id === model) && (
              <button className="lk-chip" data-on="true">{model}</button>
            )}
          </div>
        </div>
      </div>

      {loading && <div className="lk-dots"><i /><i /><i /></div>}
      {error && <div className="lk-err">{error}</div>}
      {entry && (
        <div className="lk-card" key={shown}>
          <div className="lk-term">{entry.term}</div>
          <div className="lk-meaning">{entry.meaning}</div>
          {entry.examples.map((ex, i) => (
            <div key={i} className="lk-ex" style={{ animationDelay: `${0.12 * (i + 1)}s` }}>
              {ex}
            </div>
          ))}
        </div>
      )}
      {!loading && !entry && !error && (
        <div className="lk-hint">Wrap the part you want explained in “quotes”.</div>
      )}
    </div>
  );
}

function History() {
  const rpc = useRpc<typeof rpcContract>();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const refetch = () => {
    rpc.call("history_list").then((r) => setItems(r.items), () => {});
  };
  useEffect(refetch, [rpc]);
  useRealtime("history-changed", refetch);
  return (
    <div className="lk-hist">
      <style>{CSS}</style>
      {items.length === 0 && <div className="lk-hint" style={{ padding: 12 }}>Nothing looked up yet.</div>}
      {items.map((it) => (
        <div
          key={it.id}
          className="lk-hrow"
          onClick={() => window.dispatchEvent(new CustomEvent("lookup-select", { detail: it }))}
        >
          <div className="lk-hmain">
            <div className="lk-hterm">{it.term}</div>
            <div className="lk-hmean">{it.meaning}</div>
          </div>
          <button
            className="lk-x"
            title="Remove"
            onClick={(e) => {
              e.stopPropagation();
              void rpc.call("history_delete", { id: it.id });
            }}
          >
            ×
          </button>
        </div>
      ))}
      {items.length > 0 && (
        <button className="lk-hclear" onClick={() => void rpc.call("history_clear")}>
          Clear history
        </button>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "lookup",
    title: "Lookup",
    icon: "BookA",
    path: "lookup",
    component: Lookup,
  });
  app.slots.experimental_tab({
    context: { kind: "nav-panel", panelId: "lookup" },
    availability: "fixed",
    id: "history",
    title: "History",
    icon: "History",
    component: History,
    layout: "flush",
  });
});
