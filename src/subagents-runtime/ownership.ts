export const RUNTIME_OWNER_KEY = Symbol.for("pi.agent-profiles.subagents-runtime.v1");
export type RuntimeOwner = { id: string; claimedAt: number; toolNamespace: "subagent_" | "agent_profiles_subagent_" };
export type OwnershipClaim = {
  owner: RuntimeOwner;
  claimed: boolean;
  toolNamespace: RuntimeOwner["toolNamespace"];
  diagnostic?: string;
};

/**
 * Coordinates future tool registration between independently loaded runtimes.
 * This phase only records ownership; it registers no tools.
 */
export function claimRuntimeOwner(candidate: { id: string }, target: Record<PropertyKey, unknown> = globalThis): OwnershipClaim {
  const existing = target[RUNTIME_OWNER_KEY] as RuntimeOwner | undefined;
  if (existing?.id) return {
    owner: existing,
    claimed: false,
    toolNamespace: "agent_profiles_subagent_",
    diagnostic: `Subagent runtime owner "${existing.id}" is already active; this runtime will use namespaced fallback tools when tools are added.`,
  };
  const owner: RuntimeOwner = { id: candidate.id, claimedAt: Date.now(), toolNamespace: "subagent_" };
  target[RUNTIME_OWNER_KEY] = owner;
  return { owner, claimed: true, toolNamespace: owner.toolNamespace };
}

export function releaseRuntimeOwner(claim: OwnershipClaim, target: Record<PropertyKey, unknown> = globalThis): void {
  if (claim.claimed && target[RUNTIME_OWNER_KEY] === claim.owner) delete target[RUNTIME_OWNER_KEY];
}
