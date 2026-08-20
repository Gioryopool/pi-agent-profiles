import type { AgentRoutePort, CompatibleSubagentsConfig, EffectiveRoute, RuntimeAgentDefinition } from "./types.js";
import type { Route } from "../types.js";

const field = <T>(value: T | undefined, source: EffectiveRoute["model"]["source"]) => ({ value, source });
const profileFor = (definition: RuntimeAgentDefinition, config: CompatibleSubagentsConfig): Route | undefined =>
  (definition.scope === "project" ? config.projectModelProfiles : config.globalModelProfiles)[definition.name];

/** Internal-only resolution. It deliberately never emits compatibility events. */
export function resolveEffectiveRoute(input: { agent: string; sessionId: string; definition: RuntimeAgentDefinition; config: CompatibleSubagentsConfig; routePort: AgentRoutePort; orchestrator: Route }): EffectiveRoute {
  const active = input.routePort.resolveAgentRoute(input.agent, input.sessionId);
  const profile = profileFor(input.definition, input.config);
  return {
    agent: input.agent,
    model: active?.model ? field(active.model, "route") : profile?.model ? field(profile.model, "profile") : input.definition.model ? field(input.definition.model, "definition") : input.config.defaultModel ? field(input.config.defaultModel, "default") : field(input.orchestrator.model, input.orchestrator.model ? "orchestrator" : "unresolved"),
    effort: active?.effort ? field(active.effort, "route") : profile?.effort ? field(profile.effort, "profile") : input.definition.effort ? field(input.definition.effort, "definition") : input.config.defaultEffort ? field(input.config.defaultEffort, "default") : field(input.orchestrator.effort, input.orchestrator.effort ? "orchestrator" : "unresolved"),
  };
}
