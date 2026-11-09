// bb-plugin-lookup — a tiny dictionary. Type a sentence with the part you
// don't know in "quotes"; Claude explains that part in context.
import { defineRpcContract, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { spawn } from "node:child_process";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const MODEL_PRESETS = [
  { id: "apple", label: "On-device · free & private" },
  { id: "haiku", label: "Haiku 5.5 · cheapest" },
  { id: "sonnet", label: "Sonnet 5.5 · smarter" },
  { id: "opus", label: "Opus 5.5 · deepest" },
] as const;

const entrySchema = z.object({
  term: z.string(),
  meaning: z.string(),
  examples: z.array(z.string()),
});
export type Entry = z.infer<typeof entrySchema>;

const historyItem = entrySchema.extend({
  id: z.string(),
  model: z.string(),
  at: z.string(),
});
export type HistoryItem = z.infer<typeof historyItem>;

export const rpcContract = defineRpcContract({
  history_list: {
    input: z.null(),
    output: z.object({ items: z.array(historyItem) }),
  },
  history_delete: {
    input: z.object({ id: z.string() }),
    output: z.object({ ok: z.boolean() }),
  },
  history_clear: { input: z.null(), output: z.object({ ok: z.boolean() }) },
  lookup: {
    input: z.object({ text: z.string().trim().min(1).max(2000) }),
    output: entrySchema,
  },
  get_model: { input: z.null(), output: z.object({ model: z.string() }) },
  set_model: {
    input: z.object({ model: z.string().trim().min(1).max(100) }),
    output: z.object({ model: z.string() }),
  },
});

const SYSTEM = `You are a concise dictionary. The user gives a sentence where one part is wrapped in double quotes. Explain ONLY that quoted part as it is used in that sentence.
Reply with JSON only, no markdown fences:
{"term": "<the quoted part>", "meaning": "<one short plain-English sentence>", "examples": ["<short example sentence>", "<short example sentence>"]}
Exactly 2 examples. Keep everything brief.`;

// Runs the user's own Claude Code install in print mode: no tools, no saved
// session, neutral cwd and no settings/hooks so it stays fast and cheap.
function runClaude(model: string, prompt: string): Promise<string> {
  const bin = join(homedir(), ".local", "bin", "claude");
  return new Promise((resolve, reject) => {
    const child = spawn(
      bin,
      ["-p", "--model", model, "--tools", "", "--no-session-persistence",
       "--setting-sources", "", "--system-prompt", SYSTEM],
      { cwd: tmpdir(), env: { ...process.env, PATH: `${join(homedir(), ".local", "bin")}:${process.env.PATH ?? ""}` } },
    );
    let out = "", err = "";
    const timer = setTimeout(() => child.kill(), 45_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`Could not start Claude Code: ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else reject(new Error(`Claude Code failed (model: ${model}): ${(err || out).trim().slice(0, 200)}`));
    });
    child.stdin.end(prompt);
  });
}

// Apple's on-device model, through a tiny Swift helper (native/main.swift,
// built to bin/applelm). Reads the sentence on stdin, prints JSON.
class GuardrailError extends Error {
  constructor() {
    super("Apple's on-device model refused this text");
  }
}

function applelmPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return [join(here, "bin", "applelm"), join(here, "..", "bin", "applelm")]
    .find(existsSync) ?? join(here, "bin", "applelm");
}
function runApple(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(applelmPath(), [], { cwd: tmpdir() });
    let out = "", err = "";
    const timer = setTimeout(() => child.kill(), 45_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`Could not start on-device model: ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && out.trim()) resolve(out);
      else if (code === 3) reject(new GuardrailError());
      else reject(new Error(`On-device model failed: ${(err || out).trim().slice(0, 200)}`));
    });
    child.stdin.end(prompt);
  });
}

function extractTerm(text: string): string | null {
  const m = text.match(/["“”]([^"“”]+)["“”]/);
  return m ? m[1]!.trim() : null;
}

const HISTORY_CHANGED = "history-changed";
const HISTORY_MAX = 200;

export default async function plugin(bb: BbPluginApi) {
  const readHistory = async () =>
    (await bb.storage.kv.get<HistoryItem[]>("history")) ?? [];
  const writeHistory = async (items: HistoryItem[]) => {
    await bb.storage.kv.set("history", items.slice(0, HISTORY_MAX));
    bb.realtime.publish(HISTORY_CHANGED, { count: items.length });
  };
  async function remember(entry: Entry, model: string) {
    const items = (await readHistory()).filter(
      (i) => i.term.toLowerCase() !== entry.term.toLowerCase(),
    );
    items.unshift({
      ...entry,
      id: Math.random().toString(36).slice(2, 10),
      model,
      at: new Date().toISOString(),
    });
    await writeHistory(items);
  }

  const settings = bb.settings.define({
    model: {
      type: "string",
      label: "Model (apple = on-device; or haiku/sonnet/opus/full ID via Claude Code)",
      default: "apple",
    },
  });

  bb.rpc.register(rpcContract, {
    history_list: async () => ({ items: await readHistory() }),
    history_delete: async ({ id }) => {
      await writeHistory((await readHistory()).filter((i) => i.id !== id));
      return { ok: true };
    },
    history_clear: async () => {
      await writeHistory([]);
      return { ok: true };
    },
    get_model: async () => ({ model: (await settings.get()).model }),
    set_model: async ({ model }) => {
      const next = await settings.experimental_set({ model });
      return { model: next.model };
    },
    lookup: async ({ text }) => {
      const term = extractTerm(text);
      if (term === null) {
        throw new Error('Put the part you want explained in "quotes".');
      }
      const { model } = await settings.get();
      let used = model;
      let raw: string;
      if (model === "apple") {
        try {
          raw = await runApple(text);
        } catch (e) {
          if (!(e instanceof GuardrailError)) throw e;
          // Apple's safety filter refuses slang/profanity/violence words that
          // a dictionary still needs to explain: retry with Claude Haiku.
          bb.log.info("on-device guardrail hit, falling back to haiku");
          used = "haiku";
          raw = await runClaude("haiku", text);
        }
      } else {
        raw = await runClaude(model, text);
      }
      let entry: Entry;
      try {
        const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1));
        entry = entrySchema.parse({
          term,
          meaning: json.meaning,
          examples: json.examples ?? [],
        });
      } catch {
        entry = { term, meaning: raw.trim().slice(0, 500), examples: [] };
      }
      await remember(entry, used);
      return entry;
    },
  });
}
