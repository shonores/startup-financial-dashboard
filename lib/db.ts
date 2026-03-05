import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "runway.db");

function openDb(): Database.Database {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  const conn = new Database(dbPath);
  conn.pragma("journal_mode = WAL");
  conn.pragma("busy_timeout = 5000"); // wait up to 5s on lock instead of failing
  return conn;
}

// Singleton: reuse across requests in both dev and prod.
// Using globalThis so HMR in dev doesn't create multiple connections.
const g = globalThis as unknown as {
  _runwayDb: ReturnType<typeof drizzle> | undefined;
  _runwaySqlite: Database.Database | undefined;
};

if (!g._runwaySqlite) {
  g._runwaySqlite = openDb();
  g._runwayDb = drizzle(g._runwaySqlite, { schema });
}

export const sqlite = g._runwaySqlite!;
export const db = g._runwayDb!;
