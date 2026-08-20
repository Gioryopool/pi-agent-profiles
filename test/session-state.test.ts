import { expect, it } from "vitest";
import { SessionState } from "../src/session-state.js";

it("writes Pi custom entries and restores the latest active-branch marker synchronously", () => {
  const state = new SessionState();
  const appended: unknown[] = [];
  const pi: any = {
    appendEntry: (type: string, data: unknown) => appended.push([type, data]),
  };
  const ctx: any = {
    sessionManager: {
      getSessionId: () => "s",
      getBranch: () => [
        {
          type: "custom",
          customType: "pi-agent-profiles:active",
          data: {
            profile: "one",
            route: {},
            agents: {},
            baseline: {},
            activatedAt: "x",
          },
        },
        {
          type: "custom",
          customType: "pi-agent-profiles:active",
          data: { off: true },
        },
      ],
    },
  };

  expect(state.restore(ctx)).toBeUndefined();
  state.activate(pi, ctx, {
    profile: "p",
    route: {},
    agents: {},
    baseline: {},
    activatedAt: "x",
  });
  expect(appended[0]).toMatchObject(["pi-agent-profiles:active", { profile: "p" }]);
});

it("rejects restored snapshots that contain persistence sentinels in routes", () => {
  const state = new SessionState();
  const ctx: any = {
    sessionManager: {
      getSessionId: () => "s",
      getBranch: () => [
        {
          type: "custom",
          customType: "pi-agent-profiles:active",
          data: {
            profile: "p",
            route: {},
            defaultRoute: { model: null, effort: "inherit" },
            agents: {},
            baseline: {},
            activatedAt: "x",
          },
        },
      ],
    },
  };

  expect(state.restore(ctx)).toBeUndefined();
});
