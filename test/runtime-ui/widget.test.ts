import { describe, expect, it, vi } from "vitest";
import { BackgroundWidget, BackgroundWidgetState, renderBackgroundWidgetLines } from "../../src/subagents-runtime/ui/background-widget.js";

const task = (id: string, session = "owner", status: any = "running"): any => ({ id, agent: "worker", task: "private task", parentSessionId: session, mode: "background", status, createdAt: "now", liveActivity: { trail: [], current: { label: "read" } } });

describe("background widget", () => {
  it("shows only active background work and navigates to its exact task", () => {
    const tasks = [task("one"), task("other", "other"), task("done", "owner", "completed")];
    const changed = vi.fn(); const state = new BackgroundWidgetState(() => tasks.filter((item) => item.parentSessionId === "owner"), changed);
    expect(renderBackgroundWidgetLines(tasks.filter((item) => item.parentSessionId === "owner"))).toEqual(["○ main", "○ worker read"]);
    expect(state.handleTerminalInput("\u001b[B")).toMatchObject({ consume: true });
    expect(state.renderLines()).toEqual(["○ main", "● worker read"]);
    expect(state.handleTerminalInput("\r")).toEqual({ consume: true, action: { type: "open-task", taskId: "one" } });
    expect(changed).toHaveBeenCalled();
  });

  it("returns editor focus from main and cleans selection when active work ends", () => {
    let tasks: any[] = [task("one")]; const state = new BackgroundWidgetState(() => tasks);
    state.handleTerminalInput("\u001b[B"); state.handleTerminalInput("\u001b[A");
    expect(state.handleTerminalInput("\r")).toEqual({ consume: true, action: { type: "focus-editor" } });
    tasks = [];
    expect(state.handleTerminalInput("\u001b[B")).toBeUndefined();
    expect(state.renderLines()).toEqual([]);
  });

  it("does not activate for foreground, terminal, or another-session tasks", () => {
    expect(renderBackgroundWidgetLines([{ ...task("foreground"), mode: "task" }, { ...task("done", "owner", "completed") }])).toBeUndefined();
  });

  it("contains SQLite contention during rendering but preserves other errors", () => {
    const locked = Object.assign(new Error("database is locked"), { code: "ERR_SQLITE_ERROR" });
    const blocked = new BackgroundWidget(new BackgroundWidgetState(() => { throw locked; }), {});
    expect(blocked.render(80)).toEqual([]);

    const broken = new BackgroundWidget(new BackgroundWidgetState(() => { throw new Error("unexpected bug"); }), {});
    expect(() => broken.render(80)).toThrow("unexpected bug");
  });
});
