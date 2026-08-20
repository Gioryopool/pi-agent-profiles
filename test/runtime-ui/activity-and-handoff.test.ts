import { describe, expect, it, vi } from "vitest";
import { createLiveActivityState, processSubagentEvent } from "../../src/subagents-runtime/event-processing.js";
import { buildPublicTaskSnapshot } from "../../src/subagents-runtime/snapshot-builder.js";
import { ForegroundTaskManager } from "../../src/subagents-runtime/manager.js";
import { progressText } from "../../src/subagents-runtime/render/progress.js";
import type { RuntimeAgentDefinition } from "../../src/subagents-runtime/types.js";

const definition: RuntimeAgentDefinition = { name: "worker", description: "worker", scope: "global", source: "subagents", filePath: "/worker.md", instructions: "work", tools: ["read"] };
const context = { cwd: "/project", projectTrusted: true, sessionId: "owner", orchestrator: {} };

describe("runtime activity and handoff", () => {
  it("keeps bounded, sanitized completed activity separate from the current event", () => {
    let state = createLiveActivityState();
    state = processSubagentEvent(state, { type: "tool_call", toolName: "read", input: { path: "/private/token" } });
    expect(state).toMatchObject({ trail: [], current: { label: "read" } });
    state = processSubagentEvent(state, { type: "tool_update", toolName: "read" });
    expect(state).toMatchObject({ trail: [], current: { label: "read" } });
    state = processSubagentEvent(state, { type: "tool_end", toolName: "read" });
    expect(state).toMatchObject({ trail: [{ label: "read" }] });
    expect(state.current).toBeUndefined();
    state = processSubagentEvent(state, { type: "message_end", message: { usage: { input: 4, output: 2 }, content: "secret response" } });
    for (let index = 0; index < 12; index++) state = processSubagentEvent(state, { type: "tool_end", toolName: `tool-${index}` });
    expect(state.trail).toHaveLength(8);
    expect(state.trail.at(-1)).toEqual({ label: "tool-11" });
    expect(state.trail[0]?.label).not.toContain("/private/token");
    expect(state.usage).toEqual({ input: 4, output: 2 });
  });

  it("renders completed trail dim and current activity accented", () => {
    const text = progressText({ id: "task", agent: "worker", task: "work", status: "running", mode: "task", attempt: 1, effort: "low", liveActivity: { trail: [{ label: "read" }], current: { label: "write" } } });
    expect(text).toContain("\u001b[2m↳ read\u001b[0m");
    expect(text).toContain("\u001b[1;36m↳ write\u001b[0m");
  });

  it("makes public snapshots bounded and excludes private runtime fields", () => {
    const snapshot = buildPublicTaskSnapshot({ id: "task", agent: "worker", task: "x".repeat(20_000), status: "running", createdAt: "now", result: "r".repeat(20_000), definition: { instructions: "secret" }, parentSessionId: "owner", liveActivity: { trail: [{ label: "read" }] } } as any);
    expect(snapshot.task).toHaveLength(16_000);
    expect(snapshot.result).toHaveLength(16_000);
    expect(snapshot).not.toHaveProperty("definition");
    expect(snapshot).not.toHaveProperty("parentSessionId");
    expect(snapshot.liveActivity).toEqual({ trail: [{ label: "read" }] });
  });

  it("cancels only the exact session after a double Escape", async () => {
    const runner = vi.fn(({ signal }: any) => new Promise<any>((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true })));
    const manager = new ForegroundTaskManager({ runner: { run: runner }, catalog: { discover: () => ({ catalog: [definition], definitions: { worker: definition }, diagnostics: [] }) }, routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [] } });
    const run = manager.run({ agent: "worker", task: "work" }, context);
    await vi.waitFor(() => expect(runner).toHaveBeenCalled());
    expect(manager.cancelOnDoubleEscape("other")).toBe(false);
    expect(manager.cancelOnDoubleEscape("owner")).toBe(false);
    expect(manager.cancelOnDoubleEscape("owner")).toBe(true);
    await expect(run).resolves.toMatchObject({ results: [{ status: "cancelled" }] });
  });

  it("refreshes progress every ~500ms and clears the ticker after completion", async () => {
    vi.useFakeTimers();
    try {
      let finish!: () => void;
      const gate = new Promise<void>((resolve) => { finish = resolve; });
      const runner = vi.fn(async () => { await gate; return { result: "done" }; });
      const manager = new ForegroundTaskManager({ runner: { run: runner }, catalog: { discover: () => ({ catalog: [definition], definitions: { worker: definition }, diagnostics: [] }) }, routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [] } });
      const update = vi.fn();
      const run = manager.run({ agent: "worker", task: "work" }, context, update);
      await vi.advanceTimersByTimeAsync(499);
      expect(update).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(update).toHaveBeenCalledTimes(2);
      finish();
      await run;
      const callsAfterCompletion = update.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1_000);
      expect(update).toHaveBeenCalledTimes(callsAfterCompletion);
    } finally { vi.useRealTimers(); }
  });

  it("hands off only its exact session foreground work without aborting it", async () => {
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => { finish = resolve; });
    const runner = vi.fn(async () => { await gate; return { result: "done" }; });
    const manager = new ForegroundTaskManager({ runner: { run: runner }, catalog: { discover: () => ({ catalog: [definition], definitions: { worker: definition }, diagnostics: [] }) }, routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [] } });
    const started = manager.run({ agent: "worker", task: "work" }, context);
    await vi.waitFor(() => expect(runner).toHaveBeenCalled());
    expect(manager.handoff("other")).toBe(false);
    expect(manager.handoff("owner")).toBe(true);
    await expect(started).resolves.toMatchObject({ mode: "background", results: [] });
    expect(manager.list("owner")[0]).toMatchObject({ mode: "background", status: "running" });
    finish();
    await vi.waitFor(() => expect(manager.list("owner")[0]?.status).toBe("completed"));
  });
});
