// Independently adapted from the MIT-licensed pi-subagents-j0k3r renderer structure; see THIRD_PARTY_NOTICES.md.
import { textComponent } from "./components.js";
import { renderAgents, renderTasks } from "./tools/lists.js";
import { renderSubagentCall, renderSubagentRunResult } from "./tools/subagent-run.js";
import { renderSubagentResult, renderSubagentStatus } from "./tools/subagent-result.js";
const fg = (theme: any, kind: string, text: string) => theme?.fg?.(kind, text) ?? text;
/** Renderer names are injected from the registered tool prefix, so hints never advertise an absent alias. */
export function createSubagentRenderers(prefix: "subagent_" | "agent_profiles_subagent_") {
  const resultTool = `${prefix}result`;
  return {
    run: { renderCall: (args: any, theme: any) => renderSubagentCall(args, theme, "subagent"), renderResult: (result: any, options: any, theme: any) => renderSubagentRunResult(result, options, theme, resultTool) },
    continue: { renderCall: (args: any, theme: any) => renderSubagentCall({ agent: "continue", mode: args?.mode, agents: undefined }, theme, "subagent", `continue · next attempt · id: ${args?.task_id ?? "unknown"}`), renderResult: (result: any, options: any, theme: any) => renderSubagentRunResult(result, options, theme, resultTool) },
    result: { renderResult: (result: any, options: any, theme: any) => renderSubagentResult(result, options, theme, resultTool) },
    list_agents: { renderResult: renderAgents }, list_tasks: { renderResult: (result: any, options: any, theme: any) => renderTasks(result, options, theme, resultTool) },
    status: { renderResult: (result: any, options: any, theme: any) => renderSubagentStatus(result, options, theme, resultTool) },
    cancel: { renderResult: (result: any, _options: any, theme: any) => textComponent(fg(theme, result?.isError ? "error" : "success", result?.details?.cancelled ? "Subagent task cancelled." : "Subagent task was not running.")) },
    send_message: { renderResult: (result: any, _options: any, theme: any) => textComponent(fg(theme, result?.isError ? "error" : "success", result?.details?.accepted ? `Message ${result.details.state ?? "queued"}.` : "Message was not accepted.")) },
  };
}
export const subagentRenderers = createSubagentRenderers("subagent_");
