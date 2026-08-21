import type { LiveActivity } from "./types.js";

const TRAIL_LIMIT = 8;
const LABEL_LIMIT = 160;
const label = (value: unknown) => typeof value === "string" && value.trim() ? value.trim().replace(/[\r\n\t]+/g, " ").slice(0, LABEL_LIMIT) : undefined;
const usage = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value).filter(([, amount]) => typeof amount === "number" && Number.isFinite(amount)).slice(0, 12);
  return entries.length ? Object.fromEntries(entries) : undefined;
};
const NOISY_TYPES = new Set(["turn_end", "turn_start", "message_update", "agent_end", "auto_retry_start", "agent_start"]);
const appendUnique = (trail: LiveActivity["trail"], next: { label: string }) => [...trail.filter((entry) => entry.label !== next.label), next].slice(-TRAIL_LIMIT);

/** Minimal, content-free activity projection for nested-session events. */
export function createLiveActivityState(): LiveActivity { return { trail: [] }; }
export function processSubagentEvent(previous: LiveActivity, event: unknown): LiveActivity {
  const value = event && typeof event === "object" ? event as Record<string, any> : {};
  const message = value.message && typeof value.message === "object" ? value.message : undefined;
  const type = label(value.type);
  const tool = label(value.toolName ?? value.tool_name ?? value.tool?.name);
  const activity = tool ?? (type === "message_end" ? "assistant response" : type === "message_start" ? "assistant thinking" : NOISY_TYPES.has(type ?? "") ? undefined : type);
  const complete = Boolean(type && /(?:_end|_complete|_completed|_finish|_finished)$/.test(type));
  const start = Boolean(activity && (type === "tool_call" || type === "message_start" || /(?:_start|_begin)$/.test(type ?? "")));
  let trail = previous.trail.slice(-TRAIL_LIMIT);
  let current = previous.current;
  if (complete && activity) {
    trail = appendUnique(trail, { label: current?.label ?? activity });
    current = undefined;
  } else if (activity && (start || /_update$/.test(type ?? ""))) {
    if (start && current && current.label !== activity) trail = appendUnique(trail, current);
    current = { label: activity };
  }
  const nextUsage = usage(value.usage ?? message?.usage);
  return { trail, ...(current ? { current } : {}), ...(nextUsage ? { usage: nextUsage } : previous.usage ? { usage: previous.usage } : {}) };
}
