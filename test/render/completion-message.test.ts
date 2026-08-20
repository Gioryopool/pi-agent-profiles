import { describe, expect, it } from "vitest";
import { completionMessage, completionMessageDetails, renderSubagentCompletionMessage } from "../../src/subagents-runtime/render/completion-message.js";

const task = { id: "subtask_worker_123", agent: "worker", status: "completed" as const, mode: "background" as const, attempt: 2, result: "Useful final answer", parentSessionId: "private-session", nestedSessionPath: "/private/path", definition: { instructions: "secret" } };
const theme = { fg: (_kind: string, text: string) => text, bg: (_kind: string, text: string) => text };

describe("completion message", () => {
  it("keeps one useful model-visible response and private-free bounded details", () => {
    const content = completionMessage(task);
    const details = completionMessageDetails(task);
    expect(content).toContain("Useful final answer"); expect(content.match(/Useful final answer/g)).toHaveLength(1);
    expect(JSON.stringify(details)).not.toMatch(/private-session|private\/path|secret|definition|parentSession/i);
    expect(details.task).toEqual({ id: "subtask_worker_123", agent: "worker", status: "completed", mode: "background", attempt: 2 });
  });

  it("renders a compact colored card until Ctrl+O expands the response", () => {
    const message: any = { details: completionMessageDetails(task) };
    const compact = renderSubagentCompletionMessage(message, { expanded: false }, theme).render(50).join("\n");
    const expanded = renderSubagentCompletionMessage(message, { expanded: true }, theme).render(50).join("\n");
    expect(compact).toMatch(/collapsed.*ctrl\+o/i); expect(compact).not.toContain("Useful final answer");
    expect(expanded).toContain("Useful final answer");
  });

  it("uses error styling and bounds the result", () => {
    const details = completionMessageDetails({ ...task, status: "failed", result: undefined, error: "x".repeat(10_000) });
    expect(details.result.length).toBeLessThanOrEqual(16_000);
    expect(renderSubagentCompletionMessage({ details } as any, { expanded: true }, theme).render(50).join("\n")).toContain("failed");
  });
});
