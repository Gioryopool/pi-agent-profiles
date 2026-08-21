import { mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ForegroundRunner } from "./types.js";

const forbidden = (name: string) => name.startsWith("subagent_") || name.startsWith("agent_profiles_subagent_");
export const filterRecursiveTools = (tools: string[]) => tools.filter((tool) => !forbidden(tool));
export const nestedSessionsRoot = () => join(getAgentDir(), "pi-agent-profiles", "runtime", "sessions");
function secureRoot(root = nestedSessionsRoot()) { mkdirSync(root, { recursive: true, mode: 0o700 }); try { chmodSync(root, 0o700); } catch {} return root; }
function isolateExtensions(base: any) { return { ...base, extensions: (base?.extensions ?? []).map((extension: any) => ({ ...extension, handlers: new Map([...((extension.handlers as Map<string, unknown[]>) ?? new Map())].filter(([event]) => event === "tool_call" || event === "tool_result" || event === "user_bash")), commands: new Map(), flags: new Map(), shortcuts: new Map() })) }; }

function textFrom(value: any): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value?.text === "string") return value.text;
  if (typeof value?.content === "string") return value.content;
  if (Array.isArray(value?.content)) return value.content.map((part: any) => typeof part === "string" ? part : part?.text ?? "").join("") || undefined;
  return undefined;
}
function assistantResult(messages: any[]): { text?: string; failure?: string } {
  let text: string | undefined; let failure: string | undefined;
  for (const message of messages) {
    const event = message?.message ?? message;
    const role = event?.role ?? message?.role;
    if (role !== "assistant") continue;
    const stopReason = event?.stopReason ?? event?.stop_reason ?? message?.stopReason;
    if (stopReason === "error" || stopReason === "aborted" || stopReason === "cancelled") failure = `Subagent assistant ${stopReason}${event?.error?.message ? `: ${event.error.message}` : ""}`;
    const candidate = textFrom(event) ?? textFrom(event?.content);
    if (candidate) text = candidate;
  }
  return { text, failure };
}
function aggregateUsage(messages: any[]): unknown {
  let usage: any;
  for (const message of messages) {
    const event = message?.message ?? message; const nextUsage = event?.usage ?? message?.usage;
    if (!nextUsage || typeof nextUsage !== "object") continue;
    usage = usage && typeof usage === "object" ? Object.fromEntries(Array.from(new Set([...Object.keys(usage), ...Object.keys(nextUsage)]), (key) => [key, typeof usage[key] === "number" && typeof nextUsage[key] === "number" ? usage[key] + nextUsage[key] : nextUsage[key] ?? usage[key]])) : nextUsage;
  }
  return usage;
}
function terminalEvidence(event: any): boolean {
  const message = event?.message ?? event;
  const type = String(event?.type ?? message?.type ?? "").toLowerCase();
  return type === "message_end" || (message?.role === "assistant" && ["error", "aborted", "cancelled"].includes(message?.stopReason ?? message?.stop_reason));
}
function meaningfulActivity(event: any): boolean {
  const type = String(event?.type ?? event?.message?.type ?? "").toLowerCase();
  return type.startsWith("message_") || type.startsWith("tool_") || type === "tool_call" || Boolean(event?.toolName ?? event?.tool_name);
}
function resolveModel(ctx: any, model: { provider: string; id: string } | undefined) {
  if (!model) return ctx?.model;
  const found = ctx?.modelRuntime?.getModel?.(model.provider, model.id) ?? ctx?.modelRuntime?.find?.(model.provider, model.id) ?? ctx?.modelRegistry?.find?.(model.provider, model.id);
  if (!found) throw new Error(`Configured subagent model ${model.provider}/${model.id} is unavailable in the current Pi model registry`);
  return found;
}

/** Create an SDK-backed foreground runner. It deliberately owns its nested session root. */
export function createSdkForegroundRunner(loadSdk: () => Promise<any> = () => import("@earendil-works/pi-coding-agent"), paths: { root?: () => string; agentDir?: () => string; secureRoot?: (root: string) => string } = {}): ForegroundRunner {
  return { async run(input) {
    const sdk = await loadSdk(); const agentDir = paths.agentDir ?? getAgentDir; const root = (paths.secureRoot ?? secureRoot)((paths.root ?? nestedSessionsRoot)()); const tools = filterRecursiveTools(input.tools);
    const manager = input.reopenPath
      ? typeof sdk.SessionManager?.open === "function" ? await sdk.SessionManager.open(input.reopenPath, root, input.cwd) : (() => { throw new Error("Pi SDK does not support SessionManager.open for continuation"); })()
      : typeof sdk.SessionManager?.create === "function" ? await sdk.SessionManager.create(input.cwd, root, { cwd: input.cwd }) : sdk.SessionManager?.inMemory(input.cwd);
    if (!manager) throw new Error("Pi SDK does not provide a session manager");
    const model = resolveModel(input.ctx as any, input.model);
    const options: any = { cwd: input.cwd, model, thinkingLevel: input.effort, tools, sessionManager: manager, systemPrompt: input.definition.instructions };
    if (input.config.sessionResources !== "full") {
      const Loader = sdk.DefaultResourceLoader;
      if (typeof Loader !== "function") throw new Error("Pi SDK does not provide DefaultResourceLoader for lean subagent sessions");
      const loader = new Loader({ cwd: input.cwd, agentDir: agentDir(), settingsManager: (input.ctx as any)?.settingsManager, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true, systemPromptOverride: () => input.definition.instructions, extensionsOverride: isolateExtensions });
      await loader.reload(); options.resourceLoader = loader; options.agentDir = agentDir();
    }
    const created = await sdk.createAgentSession(options); const session = created.session ?? created;
    const nestedSessionPath = input.reopenPath ?? manager.getSessionFile?.() ?? manager.sessionPath ?? manager.path ?? manager.getSessionPath?.() ?? session.sessionPath;
        if (typeof nestedSessionPath === "string") try { chmodSync(nestedSessionPath, 0o600); } catch { /* session may not be persisted until prompt */ }
    if (typeof session.steer === "function") input.onLiveBridge?.({ steer: (message) => session.steer(message) });
    let stalled = false; let externallyAborted = false; let rejectAbort!: (reason: Error) => void;
    const aborted = new Promise<never>((_, reject) => { rejectAbort = reject; });
    const abort = () => { void Promise.resolve(session.abort?.()).catch(() => undefined); };
    const onAbort = () => { externallyAborted = true; abort(); rejectAbort(new Error(`Subagent cancelled: ${String(input.signal.reason ?? "aborted")}`)); };
    input.signal.addEventListener("abort", onAbort, { once: true });
    if (input.signal.aborted) onAbort();
    const prompt = input.continuationPrompt ?? [input.context, input.task.task].filter(Boolean).join("\n\n"); let timer: ReturnType<typeof setTimeout> | undefined;
    const resetStall = () => {
      if (!input.config.stallTimeoutMs) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { stalled = true; abort(); rejectAbort(new Error(`Subagent stalled after ${input.config.stallTimeoutMs}ms`)); }, input.config.stallTimeoutMs);
    };
    const events: any[] = [];
    const receive = (event: any) => { if (terminalEvidence(event)) events.push(event), events.splice(0, Math.max(0, events.length - 20)); if (meaningfulActivity(event)) resetStall(); input.onEvent?.(event); };
    const unsubscribe = session.subscribe?.(receive) ?? session.onEvent?.(receive);
    try {
      resetStall();
      const response = await Promise.race([session.prompt(prompt, { expandPromptTemplates: false }), aborted]);
      if (typeof nestedSessionPath === "string") try { chmodSync(nestedSessionPath, 0o600); } catch { /* session persistence may be unavailable */ }
      if (stalled) throw new Error(`Subagent stalled after ${input.config.stallTimeoutMs}ms`);
      if (externallyAborted || input.signal.aborted) throw new Error(`Subagent cancelled: ${String(input.signal.reason ?? "aborted")}`);
      const sessionMessages = Array.isArray(session.messages) ? session.messages : [];
      const collected = assistantResult([...sessionMessages, ...events]);
      if (collected.failure) throw new Error(collected.failure);
      const result = textFrom(response) ?? response?.result ?? collected.text;
      if (!result) throw new Error("Subagent session completed without an assistant response");
      const eventUsage = aggregateUsage(events.filter((event) => event?.type === "message_end"));
      return { result: String(result), usage: response?.usage ?? eventUsage ?? aggregateUsage(sessionMessages), ...(typeof nestedSessionPath === "string" ? { nestedSessionPath } : {}), model: input.model, effort: input.effort };
    } finally {
      input.signal.removeEventListener("abort", onAbort); if (timer) clearTimeout(timer);
      if (typeof unsubscribe === "function") unsubscribe(); else (unsubscribe as any)?.dispose?.();
      await Promise.resolve(session.dispose?.()).catch(() => undefined);
    }
  } };
}
