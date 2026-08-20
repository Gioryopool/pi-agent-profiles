import { describe, expect, it } from "vitest";
import { buildThreadSnapshot, sanitizeThreadSnapshot } from "../src/subagents-runtime/thread-view.js";

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
});
