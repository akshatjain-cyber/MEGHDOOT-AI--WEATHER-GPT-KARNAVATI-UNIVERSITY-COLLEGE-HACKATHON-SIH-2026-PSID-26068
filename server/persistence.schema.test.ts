import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("persistence schema", () => {
  it("keeps the tables required by profile, saved locations, and conversations", () => {
    const schema = readFileSync(resolve(process.cwd(), "drizzle/schema.ts"), "utf8");
    const migration = readFileSync(resolve(process.cwd(), "drizzle/0001_marvelous_alex_wilder.sql"), "utf8");
    for (const table of ["userPreferences", "savedLocations", "conversations", "chatMessages"]) {
      expect(schema).toContain(`export const ${table}`);
    }
    for (const table of ["user_preferences", "saved_locations", "conversations", "chat_messages"]) {
      expect(migration).toContain("CREATE TABLE `" + table + "`");
    }
  });
});
