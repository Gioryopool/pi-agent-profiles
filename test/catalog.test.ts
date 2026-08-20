import { expect, it } from "vitest";
import { requestCatalog, validateCatalog } from "../src/catalog.js";

it("normalizes catalog names and rejects duplicates case-insensitively", () => {
  expect(
    validateCatalog([
      { name: " Researcher ", description: "x", scope: "project" },
    ]),
  ).toEqual([{ name: "researcher", description: "x", scope: "project" }]);
  expect(
    validateCatalog([
      { name: "a", description: "x", scope: "project" },
      { name: "A", description: "x", scope: "project" },
    ]),
  ).toEqual([]);
});

it("accepts an empty synchronous catalog and diagnoses duplicate calls", () => {
  const messages: string[] = [];
  let request: any;
  const pi: any = {
    events: {
      emit: (_: string, value: any) => {
        request = value;
        value.setAgents([]);
        value.setAgents([]);
      },
    },
  };

  expect(requestCatalog(pi, "/work", (message) => messages.push(message))).toEqual([]);
  expect(request).toMatchObject({
    version: 1,
    cwd: "/work",
    setAgents: expect.any(Function),
  });
  expect(messages).toContain("Agent catalog responded more than once");
});
