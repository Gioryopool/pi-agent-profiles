import { describe, expect, it, vi } from "vitest";
import { SubagentsHistoryPanel } from "../../src/subagents-runtime/ui/subagents-history-panel.js";
import { openHistoryOverlay } from "../../src/subagents-runtime/ui/panel-overlay.js";

const tasks: any[] = [
  { id: "one", agent: "worker", task: "first", status: "running", createdAt: "2025-01-01", attempt: 1, model: { provider: "openai", id: "gpt" } },
  { id: "two", agent: "worker", task: "second", status: "completed", createdAt: "2025-01-02" },
];
describe("subagents history panel", () => {
  it("navigates, scrolls, toggles details and cancels only the selected task", () => {
    const cancel = vi.fn(() => true); const close = vi.fn();
    const panel = new SubagentsHistoryPanel({ tasks: () => tasks, detail: (id) => ({ entries: [{ role: "assistant", text: id }] }), cancel, close });
    panel.handleInput("\u001b[C"); expect(panel.selected().id).toBe("two");
    panel.handleInput("\u001b[B"); expect(panel.selected().id).toBe("two");
    panel.handleInput("\u000f"); expect(panel.showOutput).toBe(true);
    panel.handleInput("\u0014"); expect(panel.showThinking).toBe(false);
    panel.handleInput("\u001b[D"); panel.handleInput("x"); expect(cancel).toHaveBeenCalledWith("one");
    panel.handleInput("q"); expect(close).toHaveBeenCalledOnce();
  });
  it("keeps a selected task visible across more than seven tasks and scrolls detail with mouse input", () => {
    const many = Array.from({ length: 9 }, (_, index) => ({ id: String(index), agent: "worker", task: "task", status: "completed", createdAt: "now" })) as any[];
    const panel = new SubagentsHistoryPanel({ tasks: () => many, detail: () => ({ entries: Array.from({ length: 20 }, (_, index) => ({ role: "assistant" as const, text: `response ${index}` })) }), cancel: () => false, close: () => {} });
    for (let index = 0; index < 8; index++) panel.handleInput("\u001b[C");
    expect(panel.render(100).join("\n")).toContain("● worker:completed");
    panel.handleInput("\u001b[H");
    panel.handleInput("\u001b[<65;10;10M");
    expect(panel.state().detailScroll).toBe(3);
    expect(panel.render(100).join("\n")).toContain("response 3");
  });
  it("refreshes a live overlay and disposes its interval after close", async () => {
    vi.useFakeTimers(); let done!: () => void; let renders = 0;
    const pending = openHistoryOverlay({ ui: { custom: (factory: any) => new Promise<void>((resolve) => { done = resolve; const component = factory({ requestRender: () => { renders++; } }, undefined, undefined, done); component.render(80); }) } }, { tasks: () => [], detail: () => undefined, cancel: () => false });
    await Promise.resolve(); await vi.advanceTimersByTimeAsync(1_000); expect(renders).toBe(2);
    done(); await pending; await vi.advanceTimersByTimeAsync(1_000); expect(renders).toBe(2); vi.useRealTimers();
  });
  it("renders compact public metadata and never private fields", () => {
    const panel = new SubagentsHistoryPanel({ tasks: () => [{ ...tasks[0], definition: { instructions: "SECRET" }, nestedSessionPath: "/private" }], detail: () => ({ entries: [] }), cancel: () => false, close: () => {} });
    const output = panel.render(100).join("\n");
    expect(output).toContain("agent: worker"); expect(output).toContain("id: one"); expect(output).not.toMatch(/SECRET|private/);
  });

  it("renders a height-bounded execution strip and rich detail with a tail-following response", () => {
    const panel = new SubagentsHistoryPanel({
      tasks: () => [{ id: "one", agent: "worker", task: "implement the feature", status: "completed", mode: "background", createdAt: "2025-01-01T00:00:00.000Z", startedAt: "2025-01-01T00:00:00.000Z", finishedAt: "2025-01-01T00:00:02.000Z", attempt: 2, effort: "high", model: { provider: "openai", id: "gpt" }, usage: { input: 200, output: 50, contextTokens: 250 }, liveActivity: { trail: [{ label: "read config" }], current: { label: "writing tests" } }, result: "final response" }] as any[],
      detail: () => ({ entries: Array.from({ length: 20 }, (_, index) => ({ role: "assistant" as const, text: `event ${index}` })) }),
      cancel: () => false,
      close: () => {},
      maxLines: () => 15,
      timeoutMs: 120_000,
      stallTimeoutMs: 30_000,
      contextWindowForTask: () => 1_000,
    });
    const output = panel.render(72).join("\n");
    expect(panel.render(72)).toHaveLength(15);
    expect(output).toContain("executions 1-1/1");
    expect(output).toContain("mode: background");
    expect(output).toContain("ctx:250 (25%)");
    expect(output).toContain("timeout 2m");
    expect(output).toContain("stall 30s");
    expect(output).toContain("last activity: writing tests");
    expect(output).toContain("response: final response");
    expect(output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")).toMatchInlineSnapshot(`
      "subagents session execution flow · ←/→ executions · ↑/↓ scroll · pgup/p…
      ────────────────────────────────────────────────────────────────────────
      1/1  agent: worker  status: completed  attempt: 2  mode: background
      model: openai/gpt  effort: high  timeout 2m  id: one  duration: 2s
      usage: ↑200 ↓50 ctx:250 (25%)
      last activity: writing tests  stall 30s
      task: implement the feature
      executions 1-1/1  ● worker:completed attempt:2
      ────────────────────────────────────────────────────────────────────────
      assistant: event 16
      assistant: event 17
      assistant: event 18
      assistant: event 19
      response: final response
      ────────────────────────────────────────────────────────────────19-23/23"
    `);
  });

    it("shows a persisted final response only when the thread lacks an equivalent assistant entry", () => {
      const base = { id: "one", agent: "worker", task: "work", status: "completed", createdAt: "now", result: "final response" } as any;
      const equivalent = new SubagentsHistoryPanel({ tasks: () => [base], detail: () => ({ entries: [{ role: "assistant", text: "  final   response\\n" }] }), cancel: () => false, close: () => {} }).render(100).join("\\n");
      const missing = new SubagentsHistoryPanel({ tasks: () => [base], detail: () => ({ entries: [{ role: "assistant", text: "intermediate" }] }), cancel: () => false, close: () => {} }).render(100).join("\\n");
      expect(equivalent.split("\n").filter((line) => line.startsWith("response: final response"))).toHaveLength(0);
      expect(missing).toContain("response: final response");
    });

    it("enables SGR mouse tracking for the overlay and always disables it when closed", async () => {
    let done!: () => void;
    const writes: string[] = [];
    const pending = openHistoryOverlay({ ui: { custom: (factory: any) => new Promise<void>((resolve) => { done = resolve; factory({ requestRender() {}, terminal: { write: (value: string) => writes.push(value) } }, undefined, undefined, done); }) } }, { tasks: () => [], detail: () => undefined, cancel: () => false });
    await Promise.resolve();
    expect(writes).toEqual(["\u001b[?1000h\u001b[?1006h"]);
    done(); await pending;
    expect(writes).toEqual(["\u001b[?1000h\u001b[?1006h", "\u001b[?1006l\u001b[?1000l"]);
  });
});
