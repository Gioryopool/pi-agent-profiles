import { expect, it } from "vitest";
import { ProfileManager } from "../src/profile-manager.js";

function setup(setModel: (model: unknown) => Promise<boolean> = async () => true) {
  const calls: string[] = [];
  const pi: any = {
    getThinkingLevel: () => "low",
    setThinkingLevel: (effort: string) => calls.push(`effort:${effort}`),
    setModel,
    appendEntry: () => calls.push("entry"),
  };
  const ctx: any = {
    model: { provider: "old", id: "one" },
    modelRegistry: {
      find: (provider: string, id: string) => ({ provider, id }),
    },
    sessionManager: { getSessionId: () => "s" },
    ui: { setStatus() {} },
  };

  return { calls, pi, ctx, manager: new ProfileManager(pi, ctx) };
}

it("cycles profiles in configured order", async () => {
const { manager } = setup();
manager.setConfig({
version: 1,
profiles: {
first: { order: 10 },
second: { order: 20 },
},
});

await manager.next();
expect(manager.state.get("s")?.profile).toBe("first");
await manager.next();
expect(manager.state.get("s")?.profile).toBe("second");
});

it("does not persist or change effort when Pi rejects a model", async () => {
  const { calls, manager } = setup(async () => false);
  manager.setConfig({
    version: 1,
    profiles: {
      p: {
        order: 1,
        orchestrator: {
          model: { provider: "new", id: "two" },
          effort: "high",
        },
      },
    },
  });

  await expect(manager.use("p")).rejects.toThrow("No API key");
  expect(calls).toEqual([]);
  expect(manager.state.get("s")).toBeUndefined();
});

it("switching to an omitted parent route restores each original baseline field", async () => {
  const { calls, manager } = setup();
  manager.setConfig({
    version: 1,
    profiles: {
      first: {
        order: 1,
        orchestrator: {
          model: { provider: "new", id: "two" },
          effort: "high",
        },
      },
      second: { order: 2 },
    },
  });

  await manager.use("first");
  await manager.use("second");

  expect(calls).toContain("effort:high");
  expect(calls).toContain("effort:low");
  expect(manager.state.get("s")?.baseline).toEqual({
    model: { provider: "old", id: "one" },
    effort: "low",
  });
});

it("failed switching restores the previous active parent route and snapshot", async () => {
  const { calls, manager } = setup(async (model: any) => model.provider !== "second");
  manager.setConfig({
    version: 1,
    profiles: {
      first: {
        order: 1,
        orchestrator: {
          model: { provider: "first", id: "one" },
          effort: "high",
        },
      },
      second: {
        order: 2,
        orchestrator: {
          model: { provider: "second", id: "two" },
          effort: "medium",
        },
      },
    },
  });

  await manager.use("first");
  await expect(manager.use("second")).rejects.toThrow("No API key");

  expect(manager.state.get("s")?.profile).toBe("first");
  expect(calls.filter((call) => call === "effort:high").length).toBeGreaterThan(1);
});

it("failed off keeps the active snapshot rather than appending an off marker", async () => {
  let reject = false;
  const { manager } = setup(async () => !reject);
  manager.setConfig({
    version: 1,
    profiles: {
      p: {
        order: 1,
        orchestrator: { model: { provider: "new", id: "two" } },
      },
    },
  });

  await manager.use("p");
  reject = true;
  await expect(manager.off()).rejects.toThrow("No API key");
  expect(manager.state.get("s")?.profile).toBe("p");
});

it("stores an event-safe resolved default for unknown agents", async () => {
  const { manager } = setup();
  manager.setConfig({
    version: 1,
    profiles: {
      p: {
        order: 1,
        defaultRoute: { model: null, effort: "inherit" },
        agents: {
          researcher: {
            model: { provider: "openai", id: "gpt-5" },
            effort: "high",
          },
        },
      },
    },
  });

  await manager.use("p");

  expect(manager.state.get("s")?.defaultRoute).toEqual({});
  expect(manager.route("unknown", "s")).toEqual({});
  expect(manager.route("researcher", "s")).toEqual({
    model: { provider: "openai", id: "gpt-5" },
    effort: "high",
  });
  expect(manager.resolveAgentRoute("researcher", "s")).toEqual({
    model: { provider: "openai", id: "gpt-5" },
    effort: "high",
  });
});
