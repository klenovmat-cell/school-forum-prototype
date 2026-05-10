import { mkdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const schemaPath = join(root, "init.sql");

function resolveSqlitePath(url) {
  if (!url.startsWith("file:")) {
    throw new Error("DATABASE_URL must be a SQLite file: URL.");
  }

  const databasePath = url.slice("file:".length);
  if (!databasePath) {
    throw new Error("DATABASE_URL must include a SQLite database path.");
  }

  return isAbsolute(databasePath) ? databasePath : join(root, databasePath);
}

const databasePath = resolveSqlitePath(databaseUrl);
mkdirSync(dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);

try {
  db.exec(readFileSync(schemaPath, "utf8"));
} finally {
  db.close();
}

console.log(`SQLite database is ready at ${databasePath}`);
