# Session routing contract

This extension is a neutral provider of session-scoped routes over Pi's synchronous event bus. It does not import, configure, or depend on an agent-launching extension.

## Request

A consumer may emit `pi-subagents:model-route:v1` with a mutable request:

```ts
type Route = {
  model?: { provider: string; id: string };
  effort?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
};
type Request = { version: 1; cwd: string; agent: string; sessionId?: string; setRoute(route: Route): void };
```

The provider responds only synchronously, only when `sessionId` exactly matches an active restored/selected Pi session, and only with a non-empty valid route. Persisted `model: null` and `effort: "inherit"` suppress profile defaults but are omitted from this runtime contract.

## Catalog

The editing wizard emits `pi-subagents:agents:v1` with `{ version: 1, cwd, setAgents }`. A catalog provider must make exactly one synchronous call with at most 200 `{ name, description, scope }` strings. Zero agents is valid. Names are normalized case-insensitively; malformed, duplicate, repeated, thrown, and late responses are rejected and diagnosed distinctly.

## Persistence and lifecycle

Active state is a Pi custom entry: `{ type: "custom", customType: "pi-agent-profiles:active", data }`. The latest active-branch marker wins; `{ off: true }` suppresses older activation and default activation. State restoration reads only the in-memory branch supplied by Pi, so routing does not wait on filesystem work. `session_shutdown` releases the event listener and clears only that instance's in-memory route; Pi's newly rebound extension instance can restore the persisted custom entry at its next `session_start`.

An active snapshot contains only event-safe routes plus the session's original model/effort baseline. Persisted suppression sentinels (`model: null` and `effort: "inherit"`) invalidate a restored snapshot rather than entering the runtime route contract.

## Activation and rollback

The first activation in a session captures the pre-profile model and effort baseline. Later switches retain that baseline. Omitted or suppressed parent-route fields resolve back to it.

If a profile switch fails, the manager attempts to restore the previous active parent route and keeps the previous snapshot. If initial activation fails, it attempts to restore the captured baseline and does not persist an active marker. Deactivation restores the baseline before writing the off marker; if restoration fails, the profile remains active.
