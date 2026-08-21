import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ForegroundTask } from "./types.js";
import { sanitizeThreadSnapshot } from "./thread-view.js";

/** Package-owned task store. One instance must be shared by all live managers. */
export class RuntimeHistory {
  private readonly db: DatabaseSync;
  private closed = false;
  constructor(readonly path: string, private readonly listLimit = 100) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    try { chmodSync(dirname(path), 0o700); } catch { /* non-POSIX */ }
    // Concurrent Pi processes share this package-owned database. Wait briefly for
    // a writer rather than failing immediately, and let readers proceed in WAL mode.
    this.db = new DatabaseSync(path, { timeout: 5_000 });
    try { chmodSync(path, 0o600); } catch { /* non-POSIX */ }
    this.db.exec(`PRAGMA journal_mode = WAL; CREATE TABLE IF NOT EXISTS runtime_tasks (id TEXT PRIMARY KEY, parent_session_id TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, data TEXT NOT NULL); CREATE INDEX IF NOT EXISTS runtime_tasks_session_created ON runtime_tasks(parent_session_id, created_at DESC); PRAGMA user_version = 1;`);
    // Do not depend on SQLite JSON extensions: old process work cannot be resumed.
    const stale = this.db.prepare("SELECT id, data FROM runtime_tasks WHERE status IN (?, ?)").all("queued", "running") as Array<{ id: string; data: string }>;
    for (const row of stale) {
      const task = this.parse(row.data);
      if (!task) {
        this.db.prepare("UPDATE runtime_tasks SET status = ? WHERE id = ?").run("interrupted", row.id);
        continue;
      }
      task.status = "interrupted"; task.error = "Task interrupted by a prior process shutdown"; task.finishedAt = new Date().toISOString();
      this.save(task);
    }
  }
  private ensureOpen() { if (this.closed) throw new Error("Runtime history is closed"); }
  private parse(data: string): ForegroundTask | undefined {
    try { const value = JSON.parse(data); if (!value || typeof value !== "object" || typeof value.id !== "string" || typeof value.parentSessionId !== "string" || typeof value.status !== "string") return undefined; const { definition: _legacyDefinition, controller: _controller, bridge: _bridge, messages: _messages, draining: _draining, continuing: _continuing, ...task } = value as Record<string, unknown>; return { ...task, ...(task.thread ? { thread: sanitizeThreadSnapshot(task.thread) } : {}) } as ForegroundTask; } catch { return undefined; }
  }
  save(task: ForegroundTask) {
    this.ensureOpen();
    const attempts = task.attempts?.slice(-20).map((attempt) => ({ ...attempt, result: attempt.result?.slice(0, 64_000), error: attempt.error?.slice(0, 16_000) }));
    const bounded = { ...task, context: task.context?.slice(0, 16_000), result: task.result?.slice(0, 64_000), error: task.error?.slice(0, 16_000), ...(task.thread ? { thread: sanitizeThreadSnapshot(task.thread) } : {}), ...(attempts ? { attempts } : {}) };
    this.db.prepare(`INSERT INTO runtime_tasks (id, parent_session_id, status, created_at, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET status = excluded.status, data = excluded.data`).run(bounded.id, bounded.parentSessionId ?? "", bounded.status, bounded.createdAt, JSON.stringify(bounded));
    this.db.prepare("DELETE FROM runtime_tasks WHERE parent_session_id = ? AND id NOT IN (SELECT id FROM runtime_tasks WHERE parent_session_id = ? ORDER BY rowid DESC LIMIT ?)").run(bounded.parentSessionId ?? "", bounded.parentSessionId ?? "", this.listLimit);
  }
  get(id: string, sessionId: string) { this.ensureOpen(); const row = this.db.prepare("SELECT data FROM runtime_tasks WHERE id = ? AND parent_session_id = ?").get(id, sessionId) as { data?: string } | undefined; return row?.data ? this.parse(row.data) : undefined; }
  list(sessionId: string, limit = this.listLimit) { this.ensureOpen(); const capped = Math.max(1, Math.min(limit, this.listLimit)); const rows = this.db.prepare("SELECT data FROM runtime_tasks WHERE parent_session_id = ? ORDER BY rowid DESC LIMIT ?").all(sessionId, capped) as Array<{ data: string }>; return rows.map((row) => this.parse(row.data)).filter((task): task is ForegroundTask => !!task); }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
}
