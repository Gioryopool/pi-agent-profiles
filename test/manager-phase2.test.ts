import { describe, expect, it, vi } from "vitest";
import { ForegroundTaskManager } from "../src/subagents-runtime/manager.js";
import type { RuntimeAgentDefinition } from "../src/subagents-runtime/types.js";

const agent = (name: string): RuntimeAgentDefinition => ({ name, description: name, scope: "global", source: "agents", filePath: `/${name}.md`, instructions: "Do work", tools: ["read"] });
const catalog = (definitions: Record<string, RuntimeAgentDefinition>) => ({ discover: () => ({ catalog: [], definitions, diagnostics: [] }) });
const context = { cwd: "/project", projectTrusted: true, sessionId: "parent", orchestrator: {} };

describe("Phase 2 manager lifecycle", () => {
  it("honors a concurrent cap above one and emits session-scoped progress", async () => {
    let active = 0; let peak = 0; const progress: string[][] = [];
    const manager = new ForegroundTaskManager({ runner: { run: async () => { active++; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 5)); active--; return { result: "ok" }; } }, catalog: catalog({ a: agent("a"), b: agent("b"), c: agent("c") }), routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], maxConcurrency: 2 } });
    const result = await manager.run({ agents: ["a", "b", "c"], task: "work" }, context, (tasks) => progress.push(tasks.map((task) => task.status)));
    expect(peak).toBe(2);
    expect(result.results.every((task) => task.status === "completed")).toBe(true);
    expect(progress.some((states) => states.includes("running"))).toBe(true);
  });

  it("does not invoke the runner when the invocation is already aborted", async () => {
    const run = vi.fn(async () => ({ result: "unexpected" }));
    const manager = new ForegroundTaskManager({ runner: { run }, catalog: catalog({ a: agent("a") }), routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [] } });
    const controller = new AbortController(); controller.abort("caller cancelled");
    await expect(manager.run({ agent: "a", task: "work" }, context, undefined, controller.signal)).resolves.toMatchObject({ results: [{ status: "cancelled", error: "caller cancelled" }] });
    expect(run).not.toHaveBeenCalled();
  });

  it("updates config without replacing session task ownership", async () => {
    const manager = new ForegroundTaskManager({ runner: { run: async () => ({ result: "ok" }) }, catalog: catalog({ a: agent("a") }), routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [] } });
    await manager.run({ agent: "a", task: "first" }, context);
    manager.updateConfig({ globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], defaultMode: "background" });
    expect(manager.list("parent")).toHaveLength(1);
    await expect(manager.run({ agent: "a", task: "second" }, context)).resolves.toMatchObject({ mode: "background", results: [] });
  });

  it("snapshots configuration for every queued task in an invocation", async () => {
    const original = { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], maxConcurrency: 1, defaultTools: ["old"], timeoutMs: 100, defaultModel: { provider: "old", id: "model" }, defaultEffort: "low" as const };
    const updated = { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], maxConcurrency: 1, defaultTools: ["new"], timeoutMs: 1, defaultModel: { provider: "new", id: "model" }, defaultEffort: "high" as const };
    const seen: any[] = [];
    const manager = new ForegroundTaskManager({ runner: { run: async (value) => { seen.push(value); if (value.definition.name === "a") manager.updateConfig(updated); return { result: "ok" }; } }, catalog: catalog({ a: { ...agent("a"), tools: [] }, b: { ...agent("b"), tools: [] } }), routePort: { resolveAgentRoute: () => undefined }, config: original });
    await manager.run({ agents: ["a", "b"], task: "work" }, context);
    expect(seen).toHaveLength(2);
    expect(seen.map((value) => value.tools)).toEqual([["old"], ["old"]]);
    expect(seen.map((value) => ({ model: value.model, effort: value.effort, timeoutMs: value.config.timeoutMs }))).toEqual([{ model: original.defaultModel, effort: "low", timeoutMs: 100 }, { model: original.defaultModel, effort: "low", timeoutMs: 100 }]);
    expect(seen.map((value) => value.config)).toEqual([original, original]);
  });

  it("rejects duplicate and unknown agents with discovery diagnostics and disposes only its session", async () => {
    const manager = new ForegroundTaskManager({ runner: { run: async () => ({ result: "ok" }) }, catalog: { discover: () => ({ catalog: [], definitions: { a: agent("a") }, diagnostics: [{ message: "broken definition" }] }) }, routePort: { resolveAgentRoute: () => undefined }, config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [] } });
    await expect(manager.run({ agents: ["a", "A"], task: "work" }, context)).rejects.toThrow(/duplicate/i);
    await expect(manager.run({ agent: "missing", task: "work" }, context)).rejects.toThrow(/missing.*broken definition/i);
    await manager.run({ agent: "a", task: "work" }, context);
    manager.dispose("other");
    expect(manager.list("parent")).toHaveLength(1);
  });
});
