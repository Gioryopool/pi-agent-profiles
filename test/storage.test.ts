import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createStorage } from "../src/storage.js";

it("refuses to overwrite invalid configuration", async () => {
  const path = join(await mkdtemp(join(tmpdir(), "profiles-")), "config.json");
  await writeFile(path, "not json");

  await expect(createStorage().mutate(path, (config) => config)).rejects.toThrow(
    "refusing",
  );
});

it("serializes concurrent updates and cleans temporary files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "profiles-"));
  const path = join(directory, "nested", "config.json");
  const storage = createStorage();

  await Promise.all([
    storage.mutate(path, (config) => ({
      ...config,
      profiles: { x: { order: 1 } },
    })),
    storage.mutate(path, (config) => ({
      ...config,
      profiles: { ...config.profiles, y: { order: 2 } },
    })),
  ]);

  expect((await storage.read(path)).config.profiles).toMatchObject({
    x: { order: 1 },
    y: { order: 2 },
  });
  expect(
    (await readdir(join(directory, "nested"))).filter((entry) =>
      entry.endsWith(".tmp"),
    ),
  ).toEqual([]);
});
