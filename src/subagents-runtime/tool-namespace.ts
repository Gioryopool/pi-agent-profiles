import { join } from "node:path";

export type ToolNamespace = "subagent_" | "agent_profiles_subagent_";

export type ToolNamespaceSignals = {
  agentDir: string;
  compatibleRuntimeDetected: boolean;
  configDirName: string;
  cwd: string;
  ownerClaimed: boolean;
  pathExists: (path: string) => boolean;
};

export function selectToolNamespace(signals: ToolNamespaceSignals): ToolNamespace {
  const jokerManifest = join("npm", "node_modules", "pi-subagents-j0k3r", "package.json");
  const candidates = [
    join(signals.agentDir, jokerManifest),
    join(signals.cwd, signals.configDirName, jokerManifest),
  ];
  let jokerInstalled = false;
  try {
    jokerInstalled = candidates.some(signals.pathExists);
  } catch {
    // Filesystem failures are not evidence that another runtime owns canonical names.
  }

  return signals.compatibleRuntimeDetected || !signals.ownerClaimed || jokerInstalled
    ? "agent_profiles_subagent_"
    : "subagent_";
}
