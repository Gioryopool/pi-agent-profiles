import type {
  ExtensionAPI,
  ExtensionCommandContext,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

/** Pi's public thinking levels, plus the persisted inherit sentinel. */
export type RuntimeEffort = Exclude<
  ReturnType<ExtensionAPI["getThinkingLevel"]>,
  "inherit"
>;
export type ThinkingLevel = RuntimeEffort | "inherit";

export type { ExtensionAPI, ExtensionCommandContext, ExtensionContext };

export type ModelRef = { provider: string; id: string };

/** Valid event-bus compatibility route: never serializes persistence sentinels. */
export type Route = { model?: ModelRef; effort?: RuntimeEffort };

/** Persisted route supports explicitly suppressing a profile default. */
export type PersistedRoute = { model?: ModelRef | null; effort?: ThinkingLevel };

export type Profile = {
  order: number;
  orchestrator?: PersistedRoute;
  defaultRoute?: PersistedRoute;
  agents?: Record<string, PersistedRoute>;
};

export type Config = {
  version: 1;
  defaultProfile?: string;
  cycle?: string[];
  shortcut?: string;
  profiles: Record<string, Profile>;
};

export type CatalogAgent = { name: string; description: string; scope: string };

export type ActiveSnapshot = {
  profile: string;
  route: Route;
  defaultRoute?: Route;
  agents: Record<string, Route>;
  baseline: Route;
  activatedAt: string;
};

export type RouteRequest = {
  version: 1;
  agent: string;
  cwd: string;
  sessionId?: string;
  setRoute(route: Route): void;
};

export type CatalogRequest = {
  version: 1;
  cwd: string;
  setAgents(agents: unknown): void;
};

export type PiLike = Pick<
  ExtensionAPI,
  | "appendEntry"
  | "getThinkingLevel"
  | "registerCommand"
      | "registerMessageRenderer"
      | "registerShortcut"
  | "registerTool"
  | "setModel"
  | "setThinkingLevel"
  | "sendMessage"
  | "on"
> & {
  events?: {
    on(name: string, cb: (value: unknown) => void): void | (() => void);
    off?(name: string, cb: (value: unknown) => void): void;
    emit?(name: string, value: unknown): void;
  };
};

export type ContextLike = ExtensionContext;
