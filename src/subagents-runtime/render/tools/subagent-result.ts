// Independently adapted from pi-subagents-j0k3r (MIT); see THIRD_PARTY_NOTICES.md.
import { textComponent } from "../components.js";
import { collapsedResultHint, failed, formatUsage, modelLabel, taskFromDetails } from "../formatting.js";
import { renderSubagentRunResult } from "./subagent-run.js";

function undeliveredMessages(result: any) {
  const details = result?.details ?? result;
  const task = details?.task && typeof details.task === "object" ? details.task : Array.isArray(details) ? details[0] : details?.results?.[0] ?? details?.tasks?.[0] ?? details;
  return typeof task?.undeliveredMessages === "number" ? task.undeliveredMessages : undefined;
}

export function renderSubagentResult(result: any, options: any, theme: any, resultTool: string) {
  const task = taskFromDetails(result);
  const isFailure = failed(task, result);
  if (!task) return renderSubagentRunResult(result, options, theme, resultTool);
  const fg = (kind: string, text: string) => theme?.fg?.(kind, text) ?? text;
  const usage = formatUsage(task.usage);
  const undelivered = undeliveredMessages(result);
  const summary = [
    `Subagent result: ${fg("accent", task.agent)} · status: ${fg(isFailure ? "error" : "success", task.status)} · id: ${task.id}`,
    fg("dim", `model: ${modelLabel(task.model)} · effort: ${task.effort}`),
    usage ? fg("dim", `usage: ${usage}`) : undefined,
    undelivered === undefined ? undefined : fg("dim", `undelivered messages: ${undelivered}`),
  ].filter(Boolean).join("\n");
  const final = task.result ?? task.error ?? "";
  return textComponent(options?.expanded && final ? `${summary}\n${fg("toolTitle", "Subagent response")}\n${final}` : `${summary}\n${fg("dim", collapsedResultHint(task, isFailure, resultTool))}`);
}

export const renderSubagentStatus = (result: any, options: any, theme: any, resultTool: string) => renderSubagentRunResult(result, options, theme, resultTool, "Subagent status");
export const renderSubagentContinueResult = (result: any, options: any, theme: any, resultTool: string) => renderSubagentRunResult(result, options, theme, resultTool);
