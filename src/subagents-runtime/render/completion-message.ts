// Independently adapted from the MIT-licensed pi-subagents-j0k3r completion-card structure; see THIRD_PARTY_NOTICES.md.
import { wrapLineToWidth } from "./text-width.js";
import type { PublicForegroundTask } from "../types.js";

const bound = (value: unknown, limit = 16_000) => { const text = typeof value === "string" ? value : String(value ?? ""); const suffix = "\n…[truncated]"; return text.length > limit ? `${text.slice(0, limit - suffix.length)}${suffix}` : text; };
export type CompletionDetails = { task: Pick<PublicForegroundTask, "id" | "agent" | "status" | "mode" | "attempt">; result: string };

/** Model context contains the final response once; display details intentionally exclude runtime-private fields. */
export function completionMessage(task: Pick<PublicForegroundTask, "id" | "agent" | "status" | "attempt" | "result" | "error">) {
  const result = bound(task.result ?? task.error ?? "(no result captured)");
  return `Background subagent ${task.agent} ${task.status} (id: ${task.id}${task.attempt ? `, attempt: ${task.attempt}` : ""}).\n\nFinal response:\n${result}`;
}
export function completionMessageDetails(task: Pick<PublicForegroundTask, "id" | "agent" | "status" | "mode" | "attempt" | "result" | "error">): CompletionDetails {
  return { task: { id: task.id, agent: task.agent, status: task.status, mode: task.mode, attempt: task.attempt }, result: bound(task.result ?? task.error ?? "(no result captured)") };
}

export function renderSubagentCompletionMessage(message: { details?: CompletionDetails }, options: { expanded?: boolean } | undefined, theme: any) {
  const details = message.details; const task = details?.task; const failed = task?.status === "failed" || task?.status === "cancelled" || task?.status === "interrupted"; const expanded = Boolean(options?.expanded);
  const sections: Array<{ text: string; style: "label" | "status" | "dim" | "body" | "heading" }> = [
    { text: `[subagent] ${task?.agent ?? "subagent"} ${task?.status ?? "completed"}: ${task?.id ?? ""}`.trim(), style: "label" },
    { text: `response: ${expanded ? "expanded" : "collapsed · ctrl+o to expand"}`, style: expanded ? "status" : "dim" },
  ];
  if (expanded && details?.result) sections.push({ text: "─".repeat(24), style: "dim" }, { text: "response sent to the orchestrator", style: "heading" }, ...details.result.split("\n").map((text) => ({ text, style: "body" as const })));
  const color = (style: string, text: string) => style === "label" ? theme?.fg?.(failed ? "error" : "customMessageLabel", text) ?? text : style === "status" ? theme?.fg?.(failed ? "error" : "success", text) ?? text : style === "dim" ? theme?.fg?.("dim", text) ?? text : style === "heading" ? theme?.fg?.("toolTitle", text) ?? text : theme?.fg?.("customMessageText", text) ?? text;
  return { invalidate() {}, render(width: number) { const block = Math.max(1, width); const inner = Math.max(1, block - 2); const blank = theme?.bg?.("customMessageBg", " ".repeat(block)) ?? " ".repeat(block); const lines = sections.flatMap((section) => wrapLineToWidth(section.text, inner).map((line) => { const padding = " ".repeat(Math.max(0, block - 1 - [...line].length)); return theme?.bg?.("customMessageBg", ` ${color(section.style, line)}${padding}`) ?? ` ${color(section.style, line)}${padding}`; })); return [blank, ...lines, blank]; } };
}
