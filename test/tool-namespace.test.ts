import { describe, expect, it } from "vitest";
import { createForegroundTools } from "../src/subagents-runtime/tools.js";
import { selectToolNamespace } from "../src/subagents-runtime/tool-namespace.js";

const baseSignals = {
  agentDir: "/home/test/.pi/agent",
  compatibleRuntimeDetected: false,
  configDirName: ".pi",
  cwd: "/work/project",
  ownerClaimed: true,
  pathExists: (_path: string) => false,
};

describe("subagent tool namespace selection", () => {
  it("keeps canonical names without evidence of another runtime", () => {
    expect(selectToolNamespace(baseSignals)).toBe("subagent_");
  });

  it.each([
    "/home/test/.pi/agent/npm/node_modules/pi-subagents-j0k3r/package.json",
    "/work/project/.pi/npm/node_modules/pi-subagents-j0k3r/package.json",
  ])("uses aliases when Joker is installed at Pi npm root %s", (installedPath) => {
    expect(selectToolNamespace({ ...baseSignals, pathExists: (path) => path === installedPath })).toBe("agent_profiles_subagent_");
  });

  it("uses aliases for a local owner or compatible runtime responder", () => {
    expect(selectToolNamespace({ ...baseSignals, ownerClaimed: false })).toBe("agent_profiles_subagent_");
    expect(selectToolNamespace({ ...baseSignals, compatibleRuntimeDetected: true })).toBe("agent_profiles_subagent_");
  });

  it("does not infer Joker presence from a filesystem failure", () => {
    expect(selectToolNamespace({ ...baseSignals, pathExists: () => { throw new Error("denied"); } })).toBe("subagent_");
  });

  it.each([
    { order: ["pi-multi-profiles", "pi-subagents-j0k3r"] },
    { order: ["pi-subagents-j0k3r", "pi-multi-profiles"] },
  ])(
    "avoids Pi loader conflicts with the Joker 1.5.4 catalog in order $order",
    ({ order }) => {
      const prefix = selectToolNamespace({ ...baseSignals, pathExists: (path) => path.endsWith("/npm/node_modules/pi-subagents-j0k3r/package.json") });
      const ownTools = createForegroundTools(() => undefined, () => ({}), prefix).map((tool) => tool.name);
      const joker154Tools = ["subagent_list_agents", "subagent_run", "subagent_status", "subagent_result", "subagent_list_tasks", "subagent_cancel", "subagent_send_message"];
      const catalogs = new Map([["pi-multi-profiles", ownTools], ["pi-subagents-j0k3r", joker154Tools]]);
      const loaded = order.flatMap((name) => catalogs.get(name) ?? []);

      expect(ownTools).toHaveLength(8);
      expect(ownTools.every((name) => name.startsWith("agent_profiles_subagent_"))).toBe(true);
      expect(new Set(loaded).size).toBe(loaded.length);
    },
  );
});
