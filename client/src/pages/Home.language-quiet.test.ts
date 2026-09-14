import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("language detection UI", () => {
  it("does not announce the detected language in a visible toast", () => {
    const source = readFileSync(resolve(process.cwd(), "client/src/pages/Home.tsx"), "utf8");
    expect(source).not.toContain("will reply and speak in");
    expect(source).not.toContain("detected — Meghdoot");
  });
});
