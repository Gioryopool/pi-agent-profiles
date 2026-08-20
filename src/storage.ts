import { mkdir, open, readFile, rename, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { emptyConfig, validateConfig } from "./config.js";
import type { Config } from "./types.js";

export type Storage = {
  read(path: string): Promise<{ config: Config; invalid?: string }>;
  mutate(
    path: string,
    update: (config: Config) => Config,
  ): Promise<Config>;
};

const STALE_LOCK_MS = 30_000;

async function lock(path: string) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const lockPath = `${path}.lock`;

  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      return async () => {
        await handle.close();
        await unlink(lockPath).catch(() => {});
      };
    } catch (error: unknown) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        if (Date.now() - (await stat(lockPath)).mtimeMs > STALE_LOCK_MS) {
          await unlink(lockPath);
        }
      } catch {
        // Another writer released the lock.
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw new Error(`pi-agent-profiles could not lock ${path}`);
}

export function createStorage(): Storage {
  async function read(path: string) {
    try {
      const result = validateConfig(JSON.parse(await readFile(path, "utf8")));
      return result.config
        ? { config: result.config }
        : { config: emptyConfig(), invalid: result.error };
    } catch (error: unknown) {
      return (error as NodeJS.ErrnoException).code === "ENOENT"
        ? { config: emptyConfig() }
        : {
            config: emptyConfig(),
            invalid: error instanceof Error ? error.message : "invalid JSON",
          };
    }
  }

  return {
    read,
    async mutate(path, update) {
      const release = await lock(path);
      let temporary: string | undefined;

      try {
        const current = await read(path);
        if (current.invalid) {
          throw new Error(
            `refusing to overwrite invalid configuration: ${current.invalid}`,
          );
        }

        const next = update(current.config);
        const checked = validateConfig(next);
        if (!checked.config) {
          throw new Error(`refusing to save invalid configuration: ${checked.error}`);
        }

        temporary = join(
          dirname(path),
          `.${Date.now()}.${process.pid}.${Math.random()
            .toString(16)
            .slice(2)}.pi-agent-profiles.tmp`,
        );
        const handle = await open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(`${JSON.stringify(checked.config, null, 2)}\n`);
          await handle.sync();
        } finally {
          await handle.close();
        }
        await rename(temporary, path);
        temporary = undefined;
        return checked.config;
      } finally {
        if (temporary) await unlink(temporary).catch(() => {});
        await release();
      }
    },
  };
}
