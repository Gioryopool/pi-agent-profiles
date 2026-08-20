import { AGENTS_EVENT } from "./constants.js";
import { normalizeAgent } from "./config.js";
import type { CatalogAgent, CatalogRequest, PiLike } from "./types.js";

function parseCatalog(value: unknown): { catalog?: CatalogAgent[]; error?: string } {
  if (!Array.isArray(value) || value.length > 200) {
    return { error: "Agent catalog response is malformed" };
  }

  const seen = new Set<string>();
  const result: CatalogAgent[] = [];

  for (const item of value) {
    if (!item || typeof item !== "object") {
      return { error: "Agent catalog response is malformed" };
    }

    const agent = item as Record<string, unknown>;
    if (
      typeof agent.name !== "string" ||
      !agent.name.trim() ||
      typeof agent.description !== "string" ||
      typeof agent.scope !== "string"
    ) {
      return { error: "Agent catalog response is malformed" };
    }

    const name = normalizeAgent(agent.name);
    if (seen.has(name)) {
      return { error: "Agent catalog response contains duplicate names" };
    }

    seen.add(name);
    result.push({ name, description: agent.description, scope: agent.scope });
  }

  return { catalog: result };
}

export function validateCatalog(value: unknown): CatalogAgent[] {
  return parseCatalog(value).catalog ?? [];
}

export function requestCatalog(
  pi: PiLike,
  cwd: string,
  diagnostic?: (message: string) => void,
): CatalogAgent[] {
  let response: unknown;
  let calls = 0;
  let closed = false;

  const request: CatalogRequest = {
    version: 1,
    cwd,
    setAgents(value) {
      if (closed) {
        diagnostic?.("Agent catalog responded after the synchronous request closed");
        return;
      }

      calls++;
      if (calls === 1) {
        response = value;
      } else {
        diagnostic?.("Agent catalog responded more than once");
      }
    },
  };

  try {
    pi.events?.emit?.(AGENTS_EVENT, request);
  } catch {
    diagnostic?.("Agent catalog request failed");
    return [];
  } finally {
    closed = true;
  }

  if (calls !== 1) return [];

  const parsed = parseCatalog(response);
  if (parsed.error) diagnostic?.(parsed.error);
  return parsed.catalog ?? [];
}
