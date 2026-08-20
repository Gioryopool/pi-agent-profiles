import { ACTIVE_ENTRY_TYPE } from "./constants.js";
import type { ActiveSnapshot, ContextLike, PiLike } from "./types.js";

type Marker = ActiveSnapshot | { off: true };

const EFFORTS = new Set([
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const validRoute = (value: unknown) =>
  object(value) &&
  Object.keys(value).every((key) => key === "model" || key === "effort") &&
  (value.model === undefined ||
    (object(value.model) &&
      typeof value.model.provider === "string" &&
      !!value.model.provider.trim() &&
      typeof value.model.id === "string" &&
      !!value.model.id.trim())) &&
  (value.effort === undefined ||
    (typeof value.effort === "string" && EFFORTS.has(value.effort)));
const validSnapshot = (data: unknown): data is ActiveSnapshot =>
  object(data) &&
  typeof data.profile === "string" &&
  !!data.profile &&
  validRoute(data.route) &&
  (data.defaultRoute === undefined || validRoute(data.defaultRoute)) &&
  object(data.agents) &&
  Object.values(data.agents).every(validRoute) &&
  validRoute(data.baseline) &&
  typeof data.activatedAt === "string";

export class SessionState {
  private active = new Map<string, ActiveSnapshot>();
  private off = new Set<string>();

  get(id?: string) {
    return id ? this.active.get(id) : undefined;
  }

  shouldDefault(id?: string) {
    return !!id && !this.active.has(id) && !this.off.has(id);
  }

  clear(id?: string) {
    if (id) {
      this.active.delete(id);
      this.off.delete(id);
    } else {
      this.active.clear();
      this.off.clear();
    }
  }

  activate(pi: PiLike, ctx: ContextLike, snapshot: ActiveSnapshot) {
    const id = ctx.sessionManager.getSessionId();
    if (!id) return false;

    pi.appendEntry(ACTIVE_ENTRY_TYPE, snapshot);
    this.off.delete(id);
    this.active.set(id, snapshot);
    return true;
  }

  deactivate(pi: PiLike, ctx: ContextLike) {
    const id = ctx.sessionManager.getSessionId();
    if (!id) return false;

    pi.appendEntry(ACTIVE_ENTRY_TYPE, { off: true });
    this.active.delete(id);
    this.off.add(id);
    return true;
  }

  restore(ctx: ContextLike) {
    const id = ctx.sessionManager.getSessionId();
    if (!id) return undefined;

    for (const entry of [...ctx.sessionManager.getBranch()].reverse()) {
      if (entry.type !== "custom" || entry.customType !== ACTIVE_ENTRY_TYPE) {
        continue;
      }

      const marker = entry.data as Marker | undefined;
      if (marker && typeof marker === "object" && "off" in marker && marker.off) {
        this.off.add(id);
        return undefined;
      }
      if (validSnapshot(marker)) {
        this.active.set(id, marker);
        return marker;
      }
    }

    return undefined;
  }
}
