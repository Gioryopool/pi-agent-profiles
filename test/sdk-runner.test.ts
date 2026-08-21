import { describe, expect, it, vi } from "vitest";
import { createAgentSession, createExtensionRuntime, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { createAssistantMessageEventStream, getModel } from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/compat.js";
import { createSdkForegroundRunner } from "../src/subagents-runtime/sdk-runner.js";
import type { ForegroundRunnerInput } from "../src/subagents-runtime/types.js";

const testPaths = { root: () => "/owned", agentDir: () => "/agent", secureRoot: (root: string) => root };
const input = (overrides: Partial<ForegroundRunnerInput> = {}): ForegroundRunnerInput => ({
  definition: { name: "worker", description: "worker", scope: "global", source: "subagents", filePath: "/worker.md", instructions: "Follow worker instructions.", tools: ["read", "subagent_run", "agent_profiles_subagent_run"] },
  task: { id: "t", agent: "worker", task: "work", status: "running", createdAt: "now" },
  cwd: "/project", sessionId: "parent", signal: new AbortController().signal, tools: ["read", "subagent_run", "agent_profiles_subagent_run"],
  config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], sessionResources: "lean" },
  ctx: { model: { provider: "parent", id: "model" } }, ...overrides,
});

function sdkFor(session: any, extras: Record<string, unknown> = {}) {
  return { SessionManager: { create: vi.fn(async () => ({ dispose() {} })) }, createAgentSession: vi.fn(async (options) => ({ session, options })), ...extras };
}

describe("SDK foreground runner", () => {
  it("uses subscribe, reads a void prompt result from messages, and returns assistant usage", async () => {
    const unsubscribe = vi.fn(); const session = { messages: [{ role: "assistant", content: "final answer", usage: { input: 3 } }], subscribe: vi.fn(() => unsubscribe), prompt: vi.fn(async () => undefined) };
    const sdk = sdkFor(session, { DefaultResourceLoader: class { async reload() {} } });
    await expect(createSdkForegroundRunner(async () => sdk, testPaths).run(input())).resolves.toEqual({ result: "final answer", usage: { input: 3 } });
    expect(session.subscribe).toHaveBeenCalled(); expect(unsubscribe).toHaveBeenCalled();
    expect(sdk.SessionManager.create).toHaveBeenCalledWith("/project", "/owned", { cwd: "/project" });
  });

  it("sends the delegated task text rather than stringifying its task record", async () => {
    const session = { messages: [{ role: "assistant", content: "runtime funcionando" }], subscribe: () => () => {}, prompt: vi.fn(async () => undefined) };
    await expect(createSdkForegroundRunner(async () => sdkFor(session, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input({ context: "Orchestrator context", task: { ...input().task, task: "Respondé únicamente con: runtime funcionando" } }))).resolves.toMatchObject({ result: "runtime funcionando" });
    expect(session.prompt).toHaveBeenCalledWith("Orchestrator context\n\nRespondé únicamente con: runtime funcionando", { expandPromptTemplates: false });
  });

  it("routes live bridge messages through session.steer without recursive tools", async () => {
    let bridge: { steer: (message: string) => Promise<void> | void } | undefined;
    const steer = vi.fn(); const session = { messages: [{ role: "assistant", content: "done" }], subscribe: () => () => {}, steer, prompt: async () => undefined };
    const sdk = sdkFor(session, { DefaultResourceLoader: class { async reload() {} } });
    await createSdkForegroundRunner(async () => sdk, testPaths).run(input({ onLiveBridge: (next) => { bridge = next; } }));
    await bridge!.steer("live instruction");
    expect(steer).toHaveBeenCalledWith("live instruction");
    expect((sdk.createAgentSession as any).mock.calls[0][0].tools).toEqual(["read"]);
  });

  it("runs nested task text through a real Pi 0.84.2 AgentSession pipeline", async () => {
    const prompt = "Respondé únicamente con: runtime funcionando";
    const received: any[] = []; const sessions: any[] = [];
    const sdk = {
      DefaultResourceLoader,
      SessionManager: { create: vi.fn(() => SessionManager.inMemory("/project")) },
      createAgentSession: vi.fn(async (options: any) => {
        const created = await createAgentSession({ ...options, modelRuntime: { hasConfiguredAuth: () => true, checkAuth: async () => ({ type: "api_key" }), isUsingOAuth: () => false } as any });
        const session = created.session as any; sessions.push(session);
        session.agent.streamFunction = (_model: any, context: any) => {
          received.push(context.messages);
          const answer: any = { role: "assistant", content: [{ type: "text", text: "runtime funcionando" }], api: "anthropic-messages", provider: "anthropic", model: "claude-sonnet-4-5", usage: {}, stopReason: "stop", timestamp: Date.now() };
          const stream = createAssistantMessageEventStream(); stream.push({ type: "done", reason: "stop", message: answer }); return stream;
        };
        return created;
      }),
    };
    const runner = createSdkForegroundRunner(async () => sdk, { ...testPaths, agentDir: () => "/agent" });
    const nestedTask = { ...input().task, task: prompt };
    try {
      await expect(runner.run(input({ task: nestedTask, ctx: { model: getModel("anthropic", "claude-sonnet-4-5"), settingsManager: SettingsManager.inMemory({}) } }))).resolves.toMatchObject({ result: "runtime funcionando" });
      expect(received[0].at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: prompt }] });
      expect(sessions[0].messages.at(-2)).toMatchObject({ role: "user", content: [{ type: "text", text: prompt }] });

      await expect(runner.run(input({ context: "Orchestrator context", task: nestedTask, ctx: { model: getModel("anthropic", "claude-sonnet-4-5"), settingsManager: SettingsManager.inMemory({}) } }))).resolves.toMatchObject({ result: "runtime funcionando" });
      expect(received[1].at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: "Orchestrator context\n\nRespondé únicamente con: runtime funcionando" }] });

      await expect(runner.run(input({ context: "ignored context", task: nestedTask, continuationPrompt: "continue exactly", ctx: { model: getModel("anthropic", "claude-sonnet-4-5"), settingsManager: SettingsManager.inMemory({}) } }))).resolves.toMatchObject({ result: "runtime funcionando" });
      expect(received[2].at(-1)).toMatchObject({ role: "user", content: [{ type: "text", text: "continue exactly" }] });
    } finally { for (const session of sessions) session.dispose(); }
  });

  it("opens continuations with the Pi 0.84.2 path, owned root, and cwd signature", async () => {
    const session = { messages: [{ role: "assistant", content: "continued" }], subscribe: () => () => {}, prompt: vi.fn(async () => undefined) };
    const open = vi.fn(async () => ({ getSessionFile: () => "/owned/existing.jsonl", dispose() {} }));
    const sdk = { SessionManager: { open }, createAgentSession: vi.fn(async () => ({ session })), DefaultResourceLoader: class { async reload() {} } };
    await expect(createSdkForegroundRunner(async () => sdk, testPaths).run(input({ reopenPath: "/owned/existing.jsonl", continuationPrompt: "continue" }))).resolves.toMatchObject({ result: "continued", nestedSessionPath: "/owned/existing.jsonl" });
    expect(open).toHaveBeenCalledWith("/owned/existing.jsonl", "/owned", "/project");
    expect(session.prompt).toHaveBeenCalledWith("continue", { expandPromptTemplates: false });
  });

  it("fails assistant error/aborted stops and unresolved explicit models", async () => {
    const errorSession = { messages: [{ role: "assistant", stopReason: "error", error: { message: "provider failed" } }], subscribe: () => () => {}, prompt: async () => undefined };
    await expect(createSdkForegroundRunner(async () => sdkFor(errorSession, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input())).rejects.toThrow(/assistant error.*provider failed/i);
    const abortedSession = { messages: [{ role: "assistant", stopReason: "aborted" }], subscribe: () => () => {}, prompt: async () => undefined };
    await expect(createSdkForegroundRunner(async () => sdkFor(abortedSession, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input())).rejects.toThrow(/assistant aborted/i);
    const session = { messages: [], subscribe: () => () => {}, prompt: async () => "unused" };
    await expect(createSdkForegroundRunner(async () => sdkFor(session, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input({ model: { provider: "missing", id: "model" }, ctx: { modelRuntime: { getModel: () => undefined } } }))).rejects.toThrow(/unavailable/i);
  });

  it("aborts the session for external cancellation and deterministic stalls", async () => {
    const controller = new AbortController(); const dispose = vi.fn(); const session = { messages: [], subscribe: () => () => {}, abort: vi.fn(), dispose, prompt: () => new Promise<void>((resolve) => controller.signal.addEventListener("abort", () => resolve())) };
    const runner = createSdkForegroundRunner(async () => sdkFor(session, { DefaultResourceLoader: class { async reload() {} } }), testPaths);
    const pending = runner.run(input({ signal: controller.signal })); controller.abort("caller cancelled");
    await expect(pending).rejects.toThrow(/cancelled.*caller cancelled/i); expect(session.abort).toHaveBeenCalled(); expect(dispose).toHaveBeenCalledTimes(1);
    const stalled = { messages: [], subscribe: () => () => {}, abort: vi.fn(), prompt: () => new Promise<void>(() => {}) };
    await expect(createSdkForegroundRunner(async () => sdkFor(stalled, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input({ config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], stallTimeoutMs: 1 } }))).rejects.toThrow("Subagent stalled after 1ms");
    expect(stalled.abort).toHaveBeenCalled();
  });

  it("resets the stall watchdog on provider activity but still stalls when no events arrive", async () => {
    vi.useFakeTimers();
    try {
      let receive: (event: any) => void = () => {}; let resolvePrompt!: () => void;
      const active = { messages: [{ role: "assistant", content: "finished" }], subscribe: (listener: (event: any) => void) => { receive = listener; return () => {}; }, abort: vi.fn(), prompt: () => new Promise<void>((resolve) => { resolvePrompt = resolve; }) };
      const pending = createSdkForegroundRunner(async () => sdkFor(active, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input({ config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], stallTimeoutMs: 10 } }));
      await vi.advanceTimersByTimeAsync(9); receive({ type: "message_update", message: { role: "assistant", content: "still working" } }); await vi.advanceTimersByTimeAsync(9);
      expect(active.abort).not.toHaveBeenCalled();
      resolvePrompt(); await expect(pending).resolves.toMatchObject({ result: "finished" });

      const stalled = { messages: [], subscribe: () => () => {}, abort: vi.fn(), prompt: () => new Promise<void>(() => {}) };
      const stalledRun = createSdkForegroundRunner(async () => sdkFor(stalled, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input({ config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], stallTimeoutMs: 10 } }));
      const rejected = expect(stalledRun).rejects.toThrow("Subagent stalled after 10ms");
      await vi.advanceTimersByTimeAsync(10); await rejected; expect(stalled.abort).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });

  it("does not double-count subscribed usage present in session messages and disposes sessions exactly once", async () => {
    const dispose = vi.fn(); let receive: (event: any) => void = () => {};
    const session = { messages: [{ role: "assistant", content: "final answer", usage: { input: 3 } }], subscribe: vi.fn((listener) => { receive = listener; return () => {}; }), dispose, prompt: vi.fn(async () => { receive({ type: "message_end", message: { role: "assistant", content: "final answer", usage: { input: 3 } } }); return undefined; }) };
    await expect(createSdkForegroundRunner(async () => sdkFor(session, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input())).resolves.toEqual({ result: "final answer", usage: { input: 3 } });
    expect(dispose).toHaveBeenCalledTimes(1);

    const responseDispose = vi.fn(); const responseSession = { messages: [{ role: "assistant", content: "stale", usage: { input: 3 } }], subscribe: () => () => {}, dispose: responseDispose, prompt: async () => ({ result: "response", usage: { input: 9 } }) };
    await expect(createSdkForegroundRunner(async () => sdkFor(responseSession, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input())).resolves.toEqual({ result: "response", usage: { input: 9 } });
    expect(responseDispose).toHaveBeenCalledTimes(1);

    const failedDispose = vi.fn(); const failed = { messages: [{ role: "assistant", stopReason: "error" }], subscribe: () => () => {}, dispose: failedDispose, prompt: async () => undefined };
    await expect(createSdkForegroundRunner(async () => sdkFor(failed, { DefaultResourceLoader: class { async reload() {} } }), testPaths).run(input())).rejects.toThrow(/assistant error/i);
    expect(failedDispose).toHaveBeenCalledTimes(1);
  });

  it("isolates lean resources but omits the loader in full sessions", async () => {
    const session = { messages: [{ role: "assistant", content: "ok" }], subscribe: () => () => {}, prompt: async () => undefined };
    const reload = vi.fn(); class Loader { constructor(readonly options: any) {} async reload() { reload(); } }
    const sdk = sdkFor(session, { DefaultResourceLoader: Loader }); const runner = createSdkForegroundRunner(async () => sdk, testPaths);
    await runner.run(input()); const lean = (sdk.createAgentSession as any).mock.calls[0][0];
    const unsafe = { handlers: new Map([["tool_call", ["allowed"]], ["tool_result", ["allowed"]], ["user_bash", ["allowed"]], ["before_agent_start", ["unsafe"]], ["context", ["unsafe"]]]), commands: new Map([["unsafe", {}]]), flags: new Map([["unsafe", {}]]), shortcuts: new Map([["ctrl+x", {}]]) };
    const isolated = lean.resourceLoader.options.extensionsOverride({ extensions: [unsafe] }).extensions[0];
    expect([...isolated.handlers.keys()]).toEqual(["tool_call", "tool_result", "user_bash"]);
    expect([...isolated.commands.keys()]).toEqual([]); expect([...isolated.flags.keys()]).toEqual([]); expect([...isolated.shortcuts.keys()]).toEqual([]);
    expect(reload).toHaveBeenCalled(); expect(lean.systemPrompt).toBe("Follow worker instructions."); expect(lean.tools).toEqual(["read"]); expect(lean.resourceLoader.options.systemPromptOverride()).toBe("Follow worker instructions.");
    await runner.run(input({ config: { globalModelProfiles: {}, projectModelProfiles: {}, diagnostics: [], sessionResources: "full" } }));
    const full = (sdk.createAgentSession as any).mock.calls[1][0]; expect(full.resourceLoader).toBeUndefined(); expect(full.systemPrompt).toBe("Follow worker instructions.");
  });
});
