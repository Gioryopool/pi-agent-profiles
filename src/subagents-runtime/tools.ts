import { Type } from "typebox";
import type { ForegroundTaskManager } from "./manager.js";
import { createSubagentRenderers } from "./render/tool-renderers.js";

const text = (value: unknown, summary?: string) => ({ content: [{ type: "text" as const, text: summary ?? (typeof value === "string" ? value : JSON.stringify(value)) }], details: value });
const bounded = (value: unknown, limit = 16_000) => { const valueText = typeof value === "string" ? value : String(value); return valueText.length > limit ? `${valueText.slice(0, limit)}\n…[truncated]` : valueText; };
const taskSummary = (task: any) => `Subagent ${task.id} (${task.agent}) is ${task.status}${task.attempt ? ` (attempt ${task.attempt})` : ""}.`;
const terminalTaskContent = (task: any) => {
  const route = [task.model && `model ${task.model.provider}/${task.model.id}`, task.effort && `effort ${task.effort}`].filter(Boolean).join("; ");
  const output = task.result !== undefined ? `Result:\n${bounded(task.result)}` : task.error !== undefined ? `Error:\n${bounded(task.error)}` : "No result or error was returned.";
  return `${taskSummary(task)}${route ? ` ${route}.` : ""}\n${output}`;
};
const backgroundSummary = (result: any) => `Started ${result.taskIds.length} background subagent task${result.taskIds.length === 1 ? "" : "s"}: ${result.taskIds.join(", ")}.`;
const runSummary = (result: any) => result.mode === "background"
  ? backgroundSummary(result)
  : result.mode === "mixed"
    ? [result.results.map(terminalTaskContent).join("\n\n"), backgroundSummary({ taskIds: result.taskIds.filter((id: string) => !result.results.some((task: any) => task.id === id)) })].filter(Boolean).join("\n\n")
    : result.results.map(terminalTaskContent).join("\n\n");
const fail = (error: unknown) => ({ content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }], isError: true });
export function createForegroundTools(managerFor: (ctx: any) => ForegroundTaskManager | undefined, contextFor: (ctx: any) => any, prefix: "subagent_" | "agent_profiles_subagent_") {
  const manager = (ctx: any) => { const value = managerFor(ctx); if (!value) throw new Error("Subagent runtime is not initialized for this session"); return value; };
  const id = Type.Object({ task_id: Type.String() });
  const session = (ctx: any) => ctx.sessionManager?.getSessionId?.();
  const tools = [
    { name: `${prefix}list_agents`, label: "List agents", description: "List available subagents.", parameters: Type.Object({}), async execute(_: string, __: unknown, ___: AbortSignal, ____: unknown, ctx: any) { try { return text(manager(ctx).agents(contextFor(ctx))); } catch (e) { return fail(e); } } },
    { name: `${prefix}run`, label: "Run subagent", description: "Run a subagent task in foreground or background.", parameters: Type.Object({ agent: Type.Optional(Type.String()), agents: Type.Optional(Type.Array(Type.String())), task: Type.String(), context: Type.Optional(Type.String()), mode: Type.Optional(Type.Union([Type.Literal("task"), Type.Literal("background")])) }), async execute(_: string, params: any, signal: AbortSignal, update: any, ctx: any) { try { const result = await manager(ctx).run(params, contextFor(ctx), (tasks) => update?.(text(tasks, `Subagent progress: ${tasks.map(taskSummary).join(" ")}`)), signal); return result.results?.some((task) => task.status === "failed" || task.status === "cancelled") ? { ...text(result, runSummary(result)), isError: true } : text(result, runSummary(result)); } catch (e) { return fail(e); } } },
    { name: `${prefix}status`, label: "Subagent status", description: "Get a subagent task status.", parameters: id, async execute(_: string, p: any, __: AbortSignal, ___: unknown, ctx: any) { try { const task = manager(ctx).status(p.task_id, session(ctx)); return text(task ?? { error: "Unknown task" }, task ? taskSummary(task) : "Unknown task."); } catch (e) { return fail(e); } } },
    { name: `${prefix}result`, label: "Subagent result", description: "Get a completed subagent result.", parameters: id, async execute(_: string, p: any, __: AbortSignal, ___: unknown, ctx: any) { try { const task = manager(ctx).result(p.task_id, session(ctx)); return text(task, terminalTaskContent(task)); } catch (e) { return fail(e); } } },
    { name: `${prefix}list_tasks`, label: "List tasks", description: "List this session's persisted subagent tasks.", parameters: Type.Object({}), async execute(_: string, __: unknown, ___: AbortSignal, ____: unknown, ctx: any) { try { const tasks = manager(ctx).list(session(ctx)); return text(tasks, `Found ${tasks.length} subagent task${tasks.length === 1 ? "" : "s"}.`); } catch (e) { return fail(e); } } },
    { name: `${prefix}cancel`, label: "Cancel task", description: "Cancel a running subagent task.", parameters: id, async execute(_: string, p: any, __: AbortSignal, ___: unknown, ctx: any) { try { return text({ cancelled: manager(ctx).cancel(p.task_id, session(ctx)) }); } catch (e) { return fail(e); } } },
    { name: `${prefix}send_message`, label: "Send subagent message", description: "Steer a running subagent owned by this session.", parameters: Type.Object({ task_id: Type.String(), message: Type.String() }), async execute(_: string, p: any, __: AbortSignal, ___: unknown, ctx: any) { try { return text(manager(ctx).sendMessage(p.task_id, session(ctx), p.message)); } catch (e) { return fail(e); } } },
    { name: `${prefix}continue`, label: "Continue subagent", description: "Continue a terminal package-owned subagent session in task or background mode.", parameters: Type.Object({ task_id: Type.String(), prompt: Type.String(), mode: Type.Optional(Type.Union([Type.Literal("task"), Type.Literal("background")])) }), async execute(_: string, p: any, signal: AbortSignal, ___: unknown, ctx: any) { try { const args = [p.task_id, session(ctx), p.prompt, contextFor(ctx), signal] as const; const result = p.mode === undefined ? await manager(ctx).continue(...args) : await manager(ctx).continue(...args, p.mode); return result.mode === "background" ? text(result, runSummary(result)) : result.status === "failed" || result.status === "cancelled" ? { ...text(result, terminalTaskContent(result)), isError: true } : text(result, terminalTaskContent(result)); } catch (e) { return fail(e); } } },
    ];
  const renderers = createSubagentRenderers(prefix);
  return tools.map((tool) => ({ ...tool, ...(renderers[tool.name.slice(prefix.length) as keyof typeof renderers] ?? {}) }));
}
