import { AssistantMessageComponent, ToolExecutionComponent, UserMessageComponent } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { ThreadEntry } from "../thread-view.js";

export type ThreadEntryRenderer = (entry: ThreadEntry, width: number, expanded: boolean) => string[] | undefined;
const fallback = (entry: ThreadEntry) => [`${entry.role}${entry.name ? `:${entry.name}` : ""}: ${entry.text}`];
/** Uses Pi's native message/tool components when construction succeeds; persisted data always has a text fallback. */
export function createPiThreadEntryRenderer(tui: unknown, cwd = ""): ThreadEntryRenderer {
  return (entry, width, expanded) => {
    try {
      let component: Component;
      if (entry.role === "user") component = new UserMessageComponent(entry.text);
      else if (entry.role === "tool") {
        const tool = new ToolExecutionComponent(entry.name ?? "tool", `history-${entry.name ?? "tool"}`, {}, undefined, undefined, tui as any, cwd);
        tool.markExecutionStarted(); tool.setArgsComplete(); tool.updateResult({ content: [{ type: "text", text: entry.text }], isError: false }); tool.setExpanded(expanded); component = tool;
      } else {
        component = new AssistantMessageComponent({ role: "assistant", content: [{ type: entry.role === "thinking" ? "thinking" : "text", [entry.role === "thinking" ? "thinking" : "text"]: entry.text }] } as any, false);
      }
      return component.render(Math.max(1, width));
    } catch { return fallback(entry); }
  };
}
export const renderThreadEntryFallback = fallback;
