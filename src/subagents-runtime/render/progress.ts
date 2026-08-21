// Independently adapted from pi-subagents-j0k3r (MIT); see THIRD_PARTY_NOTICES.md.
import { formatUsage, modelLabel, type RenderTask } from "./formatting.js";

const ACTIVITY_LIMIT = 3;

function compactActivity(task: RenderTask): string[] {
  const current = task.liveActivity?.current?.label;
  const trail = (task.liveActivity?.trail ?? []).map((entry) => entry.label).filter((label): label is string => typeof label === "string" && Boolean(label));
  const labels = [...trail, ...(current ? [current] : [])]
    .reduce<string[]>((unique, label) => [...unique.filter((entry) => entry !== label), label], [])
    .slice(-ACTIVITY_LIMIT);
  if (!labels.length) return [`↳ ${task.lastActivity ?? task.task ?? task.id}`];
  return labels.map((label) => label === current
    ? `\u001b[1;36m↳ ${label}\u001b[0m`
    : `\u001b[2m↳ ${label}\u001b[0m`);
}

export function progressText(task: RenderTask | undefined, frame = 0) {
  const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"][frame % 10]!;
  if (!task) return `${spinner} Starting subagent…`;
  const usage = formatUsage(task.usage);
  return [
    `${spinner} agent: ${task.agent} · status: ${task.status} · attempt: ${task.attempt} · effort: ${task.effort}`,
    `↳ model: ${modelLabel(task.model)}${usage ? ` · usage: ${usage}` : ""}`,
    ...compactActivity(task),
    task.backgroundable ? `↳ ${task.backgroundShortcut ?? "ctrl+h"} to send to background` : undefined,
  ].filter(Boolean).join("\n");
}
