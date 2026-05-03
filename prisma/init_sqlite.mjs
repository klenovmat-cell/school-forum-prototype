import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = dirname(fileURLToPath(import.meta.url));
const databasePath = join(root, "dev.db");
const schemaPath = join(root, "init.sql");
const db = new DatabaseSync(databasePath);

try {
  db.exec(readFileSync(schemaPath, "utf8"));
} finally {
  db.close();
}

console.log(`SQLite database is ready at ${databasePath}`);
