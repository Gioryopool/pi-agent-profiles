import { normalizeAgent, resolveDefaultRoute, resolveRoute } from "./config.js";
import { STATUS_KEY } from "./constants.js";
import { SessionState } from "./session-state.js";
import type { AgentRoutePort } from "./subagents-runtime/types.js";
import type {
  ActiveSnapshot,
  Config,
  ContextLike,
  PersistedRoute,
  PiLike,
  Route,
} from "./types.js";

export class ProfileManager implements AgentRoutePort {
  readonly state = new SessionState();
  config: Config = { version: 1, profiles: {} };
  private ctx?: ContextLike;

  constructor(
    readonly pi: PiLike,
    ctx?: ContextLike,
  ) {
    this.ctx = ctx;
  }

  setContext(ctx: ContextLike) {
    this.ctx = ctx;
  }

  setConfig(config: Config) {
    this.config = config;
  }

  private context() {
    if (!this.ctx) throw new Error("No active Pi context");
    return this.ctx;
  }

  names() {
    const ordered = Object.entries(this.config.profiles)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([name]) => name);
    return this.config.cycle?.length ? this.config.cycle : ordered;
  }

  private target(route: PersistedRoute | undefined, baseline: Route): Route {
    return {
      ...(route?.model
        ? { model: route.model }
        : baseline.model
          ? { model: baseline.model }
          : {}),
      ...(route?.effort && route.effort !== "inherit"
        ? { effort: route.effort }
        : baseline.effort
          ? { effort: baseline.effort }
          : {}),
    };
  }

  private async apply(ctx: ContextLike, target: Route) {
    if (target.model) {
      const model = ctx.modelRegistry.find(
        target.model.provider,
        target.model.id,
      );
      if (!model) {
        throw new Error(
          `model ${target.model.provider}/${target.model.id} is unavailable`,
        );
      }
      if (!(await this.pi.setModel(model))) {
        throw new Error(
          `No API key for ${target.model.provider}/${target.model.id}`,
        );
      }
    }
    if (target.effort !== undefined) this.pi.setThinkingLevel(target.effort);
  }

  private async restoreBaseline(ctx: ContextLike, baseline: Route) {
    await this.apply(ctx, baseline);
  }

  async use(name: string) {
    const ctx = this.context();
    const profile = this.config.profiles[name];
    if (!profile) throw new Error(`Unknown profile: ${name}`);

    const current = this.state.get(ctx.sessionManager.getSessionId());
    const baseline: Route = current?.baseline ?? {
      ...(ctx.model
        ? { model: { provider: ctx.model.provider, id: ctx.model.id } }
        : {}),
      effort: this.pi.getThinkingLevel(),
    };
    const target = this.target(profile.orchestrator, baseline);

    try {
      await this.apply(ctx, target);
      const snapshot: ActiveSnapshot = {
        profile: name,
        route: resolveDefaultRoute(profile.orchestrator),
        defaultRoute: resolveDefaultRoute(profile.defaultRoute),
        agents: Object.fromEntries(
          Object.keys(profile.agents ?? {}).map((agent) => [
            agent,
            resolveRoute(profile, agent),
          ]),
        ),
        baseline,
        activatedAt: new Date().toISOString(),
      };
      if (!this.state.activate(this.pi, ctx, snapshot)) {
        throw new Error("no active Pi session");
      }
      ctx.ui.setStatus(STATUS_KEY, name);
      return snapshot;
    } catch (error) {
      if (current) {
        try {
          await this.apply(ctx, this.target(current.route, current.baseline));
        } catch {
          // Retain the original failed-switch error.
        }
      } else {
        try {
          await this.restoreBaseline(ctx, baseline);
        } catch {
          // Retain the original activation error.
        }
      }
      throw error;
    }
  }

  async off() {
    const ctx = this.context();
    const active = this.state.get(ctx.sessionManager.getSessionId());
    if (!active) return;

    await this.restoreBaseline(ctx, active.baseline);
    if (!this.state.deactivate(this.pi, ctx)) {
      throw new Error("no active Pi session");
    }
    ctx.ui.setStatus(STATUS_KEY, undefined);
  }

  async next() {
    const names = this.names();
    if (!names.length) throw new Error("No profiles configured");

    const current = this.state.get(
      this.context().sessionManager.getSessionId(),
    )?.profile;
    return this.use(names[(names.indexOf(current ?? "") + 1 + names.length) % names.length]);
  }

  resolveAgentRoute(agent: string, sessionId: string) {
    const active = this.state.get(sessionId);
    return active
      ? active.agents[normalizeAgent(agent)] ?? active.defaultRoute
      : undefined;
  }

  /** Backward-compatible alias for the optional external event adapter. */
  route(agent: string, sessionId?: string) {
    return sessionId ? this.resolveAgentRoute(agent, sessionId) : undefined;
  }
}
