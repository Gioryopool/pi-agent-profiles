import type { ForegroundTask } from "./types.js";

export type ThreadEntry = { role: "user" | "assistant" | "tool" | "thinking" | "custom"; text: string; name?: string; toolCallId?: string };
export type ThreadSnapshot = { entries: ThreadEntry[] };
const LIMIT = 8_000;
const ENTRY_LIMIT = 100;
const EVENT_LIMIT = 200;
const PRIVATE_KEY = /(?:^|_)(?:nested_?session_?path|file_?path|definition|instructions?|cwd|home|token|secret|password)(?:$|_)/i;

const clean = (value: unknown, limit = LIMIT) => typeof value === "string" ? value.replace(/\u001b\[[0-9;]*m/g, "").slice(0, limit) : undefined;
const safeRole = (value: unknown): ThreadEntry["role"] | undefined => ["user", "assistant", "tool", "thinking", "custom"].includes(String(value)) ? value as ThreadEntry["role"] : undefined;
const safeName = (value: unknown) => clean(value, 120)?.replace(/[\r\n\t]+/g, " ").trim() || undefined;
const safeToolCallId = (value: unknown) => clean(value, 120)?.replace(/[\r\n\t]+/g, " ").trim() || undefined;
const safeValue = (value: unknown, depth = 0): unknown => {
  if (depth > 4) return "[truncated]";
  if (typeof value === "string") return clean(value);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safeValue(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([key]) => !PRIVATE_KEY.test(key)).slice(0, 20).map(([key, item]) => [key, safeValue(item, depth + 1)]));
  return undefined;
};
const structured = (value: unknown) => {
  const safe = safeValue(value);
  if (safe === undefined) return undefined;
  try { return JSON.stringify(safe).slice(0, LIMIT); } catch { return undefined; }
};
const contentEntries = (role: ThreadEntry["role"], content: unknown): ThreadEntry[] => {
  if (typeof content === "string") return clean(content) ? [{ role, text: clean(content)! }] : [];
  if (!Array.isArray(content)) return [];
  return content.slice(0, 40).flatMap((part): ThreadEntry[] => {
    if (typeof part === "string") return clean(part) ? [{ role, text: clean(part)! }] : [];
    if (!part || typeof part !== "object") return [];
    const item = part as Record<string, unknown>;
    const kind = String(item.type ?? "").toLowerCase();
    const body = clean(item.text) ?? clean(item.thinking) ?? clean(item.content);
    if (!body) return [];
    return [{ role: kind === "thinking" || kind === "reasoning" ? "thinking" : role, text: body }];
  });
};
const toolEntry = (event: Record<string, unknown>): ThreadEntry | undefined => {
  const name = safeName(event.toolName ?? event.tool_name ?? (event.tool as Record<string, unknown> | undefined)?.name) ?? "tool";
  const chunks: string[] = [];
  const args = structured(event.args ?? event.arguments ?? event.input);
  const result = event.result ?? event.partialResult ?? event.output ?? event.error;
  const isError = Boolean(event.error ?? event.isError);
  const output = typeof result === "object" && result && Array.isArray((result as Record<string, unknown>).content)
    ? contentEntries("tool", (result as Record<string, unknown>).content).map((entry) => entry.text).join("\n")
    : clean(result) ?? structured(result);
  if (args) chunks.push(`args: ${args}`);
  if (output) chunks.push(args || isError ? `${isError ? "error" : "result"}: ${output}` : output);
  const toolCallId = safeToolCallId(event.toolCallId ?? event.tool_call_id ?? (event.toolCall as Record<string, unknown> | undefined)?.id);
  return chunks.length ? { role: "tool", name, text: chunks.join("\n").slice(0, LIMIT), ...(toolCallId ? { toolCallId } : {}) } : undefined;
};

const mergeToolEntry = (previous: ThreadEntry, next: ThreadEntry): ThreadEntry => {
  const previousArgs = previous.text.split("\n").filter((line) => line.startsWith("args: "));
  const nextArgs = next.text.split("\n").filter((line) => line.startsWith("args: "));
  const nextOutput = next.text.split("\n").filter((line) => !line.startsWith("args: "));
  const text = [...(nextArgs.length ? nextArgs : previousArgs), ...nextOutput].join("\n").slice(0, LIMIT);
  return { ...next, text, ...(previous.toolCallId ? { toolCallId: previous.toolCallId } : {}) };
};

/** Converts Pi nested message/tool events into a bounded, path-free internal timeline. */
export function buildThreadSnapshot(events: unknown[]): ThreadSnapshot {
  const entries: ThreadEntry[] = [];
  for (const raw of events.slice(-EVENT_LIMIT)) {
    const outer = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    // Existing sanitized entries are accepted so callers can append a single live event.
    const existingRole = safeRole(outer.role);
    if (existingRole && clean(outer.text)) { entries.push({ role: existingRole, text: clean(outer.text)!, ...(safeName(outer.name) ? { name: safeName(outer.name) } : {}), ...(safeToolCallId(outer.toolCallId) ? { toolCallId: safeToolCallId(outer.toolCallId) } : {}) }); continue; }
    const event = outer.message && typeof outer.message === "object" ? outer.message as Record<string, unknown> : outer;
    const type = String(outer.type ?? event.type ?? "").toLowerCase();
    if (type.includes("tool_execution") || type.includes("tool_call") || type.includes("tool_result") || outer.toolName || outer.tool_name) {
      const tool = toolEntry(outer); if (tool) entries.push(tool); continue;
    }
    const role = safeRole(event.role) ?? (type.includes("custom") ? "custom" : undefined);
    if (!role) continue;
    const parts = contentEntries(role, event.content);
    if (parts.length) { entries.push(...parts); continue; }
    const body = clean(event.text) ?? clean(event.result);
    if (body) entries.push({ role, text: body, ...(safeName(event.name) ? { name: safeName(event.name) } : {}) });
  }
  return { entries: entries.slice(-ENTRY_LIMIT) };
}
/** Validates untrusted persisted JSON before a panel ever renders it. */
export function sanitizeThreadSnapshot(value: unknown): ThreadSnapshot {
  const raw: unknown[] = value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).entries) ? (value as Record<string, unknown>).entries as unknown[] : [];
  return { entries: raw.slice(-ENTRY_LIMIT).flatMap((entry: unknown): ThreadEntry[] => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>; const role = safeRole(item.role); const text = clean(item.text); const name = safeName(item.name);
    const toolCallId = safeToolCallId(item.toolCallId);
    return role && text ? [{ role, text, ...(name ? { name } : {}), ...(role === "tool" && toolCallId ? { toolCallId } : {}) }] : [];
  }) };
}
export function appendThreadEvent(snapshot: ThreadSnapshot | undefined, event: unknown): ThreadSnapshot {
  const next = buildThreadSnapshot([event]).entries;
  if (!next.length) return sanitizeThreadSnapshot(snapshot);
  const entries = [...(snapshot?.entries ?? [])];
  for (const entry of next) {
    let existing = -1;
    if (entry.role === "tool" && entry.toolCallId) for (let index = entries.length - 1; index >= 0; index--) if (entries[index].role === "tool" && entries[index].toolCallId === entry.toolCallId) { existing = index; break; }
    if (existing >= 0) entries[existing] = mergeToolEntry(entries[existing], entry);
    else if ((entry.role === "assistant" || entry.role === "thinking") && entries.at(-1)?.role === entry.role) entries[entries.length - 1] = entry;
    else entries.push(entry);
  }
  return sanitizeThreadSnapshot({ entries: entries.slice(-ENTRY_LIMIT) });
}
export function taskThread(task: Pick<ForegroundTask, "thread">): ThreadSnapshot { return sanitizeThreadSnapshot(task.thread); }
