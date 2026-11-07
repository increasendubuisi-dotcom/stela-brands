import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOCK_TYPES } from "./blocks";
import { STRATEGY_FIELD_KEYS } from "./entities";

// The database enforces the same block types and strategy keys as these schemas.
// If one side changes without the other, saves would fail at runtime; this catches it in CI.
const migrationsDir = join(__dirname, "../../../supabase/migrations");
const sql = readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), "utf8"))
  .join("\n");

function checkList(column: string): string[] {
  const re = new RegExp(`${column} text not null check \\(${column} in \\(([^)]*)\\)`, "g");
  const matches = [...sql.matchAll(re)];
  const last = matches.at(-1);
  if (!last?.[1]) throw new Error(`No check constraint found for ${column}`);
  return [...last[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);
}

describe("schema stays in sync with the database", () => {
  it("block types", () => {
    expect(checkList("type").sort()).toEqual([...BLOCK_TYPES].sort());
  });

  it("strategy field keys", () => {
    expect(checkList("key").sort()).toEqual([...STRATEGY_FIELD_KEYS].sort());
  });
});
