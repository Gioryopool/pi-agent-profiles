import { describe, expect, it } from "vitest";
import { appendThreadEvent, buildThreadSnapshot, sanitizeThreadSnapshot } from "../src/subagents-runtime/thread-view.js";

describe("thread snapshots", () => {
  it("bounds real nested events and excludes private definition/session fields", () => {
    const snapshot = buildThreadSnapshot([
      { type: "message_end", message: { role: "assistant", content: "answer", usage: { input: 3 } } },
      { type: "tool_result", toolName: "read", result: "ok", nestedSessionPath: "/private/session", definition: { instructions: "SECRET" } },
    ]);
    expect(snapshot.entries).toEqual(expect.arrayContaining([expect.objectContaining({ role: "assistant", text: "answer" }), expect.objectContaining({ role: "tool", name: "read", text: "ok" })]));
    expect(JSON.stringify(snapshot)).not.toMatch(/SECRET|nestedSessionPath|\/private\/session/);
  });
  it("drops malformed persisted snapshots", () => {
    expect(sanitizeThreadSnapshot({ entries: [{ role: "assistant", text: 3 }, { role: "tool", name: "x", text: "ok" }] })).toEqual({ entries: [{ role: "tool", name: "x", text: "ok" }] });
  });
  it("builds Pi message parts and structured tool lifecycle entries without retaining private fields", () => {
    const snapshot = buildThreadSnapshot([
      { type: "message_end", message: { role: "assistant", content: [{ type: "thinking", thinking: "plan" }, { type: "text", text: "answer" }] } },
      { type: "tool_execution_end", toolName: "read", args: { path: "/private/file" }, result: { content: [{ type: "text", text: "ok" }] }, nestedSessionPath: "/private/session" },
    ]);
    expect(snapshot.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ role: "thinking", text: "plan" }),
      expect.objectContaining({ role: "assistant", text: "answer" }),
      expect.objectContaining({ role: "tool", name: "read", text: expect.stringContaining("ok") }),
    ]));
    expect(JSON.stringify(snapshot)).not.toContain("nestedSessionPath");
  });
  it("merges repeated tool lifecycle and streamed assistant updates into one entry each", () => {
    let snapshot = appendThreadEvent(undefined, { type: "tool_execution_start", toolCallId: "call-1", toolName: "bash", args: { command: "compact" } });
    snapshot = appendThreadEvent(snapshot, { type: "tool_execution_update", toolCallId: "call-1", toolName: "bash", partialResult: "working" });
    snapshot = appendThreadEvent(snapshot, { type: "tool_execution_end", toolCallId: "call-1", toolName: "bash", result: "complete" });
    snapshot = appendThreadEvent(snapshot, { type: "message_update", message: { role: "assistant", content: "partial" } });
    snapshot = appendThreadEvent(snapshot, { type: "message_end", message: { role: "assistant", content: "final answer" } });
    expect(snapshot.entries).toEqual([
      expect.objectContaining({ role: "tool", name: "bash", toolCallId: "call-1", text: expect.stringContaining("complete") }),
      { role: "assistant", text: "final answer" },
    ]);
  });
});
