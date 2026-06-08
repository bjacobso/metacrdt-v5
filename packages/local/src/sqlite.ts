import type { AsyncLocalRuntimeStorage } from "./async.js";

export type SqliteStatementLike = {
  get?(...params: readonly unknown[]): unknown | Promise<unknown>;
  run?(...params: readonly unknown[]): unknown | Promise<unknown>;
};

export type SqliteDatabaseLike = {
  exec?(sql: string): unknown | Promise<unknown>;
  prepare(sql: string): SqliteStatementLike | Promise<SqliteStatementLike>;
};

export type SqliteStorageOptions = {
  db: SqliteDatabaseLike;
  tableName?: string;
  initialize?: boolean;
};

function identifier(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`invalid SQLite table name: ${name}`);
  }
  return `"${name}"`;
}

function valueFromRow(row: unknown): string | null {
  if (row === undefined || row === null) return null;
  if (typeof row === "string") return row;
  if (Array.isArray(row)) return typeof row[0] === "string" ? row[0] : null;
  if (typeof row === "object" && "value" in row) {
    const value = (row as { value?: unknown }).value;
    return typeof value === "string" ? value : null;
  }
  return null;
}

async function prepare(
  db: SqliteDatabaseLike,
  sql: string,
): Promise<SqliteStatementLike> {
  return await db.prepare(sql);
}

/**
 * SQLite-backed async key/value storage. It targets the common prepare/get/run
 * shape used by better-sqlite3, sql.js wrappers, Bun SQLite wrappers, and test
 * doubles, without adding a native SQLite dependency to this package.
 */
export class SqliteRuntimeStorage implements AsyncLocalRuntimeStorage {
  private readonly table: string;

  private constructor(
    private readonly db: SqliteDatabaseLike,
    tableName: string,
  ) {
    this.table = identifier(tableName);
  }

  static async open(options: SqliteStorageOptions): Promise<SqliteRuntimeStorage> {
    const storage = new SqliteRuntimeStorage(
      options.db,
      options.tableName ?? "metacrdt_kv",
    );
    if (options.initialize ?? true) await storage.initialize();
    return storage;
  }

  async initialize(): Promise<void> {
    const sql = `CREATE TABLE IF NOT EXISTS ${this.table} (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)`;
    if (this.db.exec) {
      await this.db.exec(sql);
      return;
    }
    const stmt = await prepare(this.db, sql);
    if (!stmt.run) throw new Error("SQLite statement does not support run()");
    await stmt.run();
  }

  async getItem(key: string): Promise<string | null> {
    const stmt = await prepare(
      this.db,
      `SELECT value FROM ${this.table} WHERE key = ?`,
    );
    if (!stmt.get) throw new Error("SQLite statement does not support get()");
    return valueFromRow(await stmt.get(key));
  }

  async setItem(key: string, value: string): Promise<void> {
    const stmt = await prepare(
      this.db,
      `INSERT OR REPLACE INTO ${this.table} (key, value) VALUES (?, ?)`,
    );
    if (!stmt.run) throw new Error("SQLite statement does not support run()");
    await stmt.run(key, value);
  }

  async removeItem(key: string): Promise<void> {
    const stmt = await prepare(this.db, `DELETE FROM ${this.table} WHERE key = ?`);
    if (!stmt.run) throw new Error("SQLite statement does not support run()");
    await stmt.run(key);
  }
}

export function sqliteStorage(
  options: SqliteStorageOptions,
): Promise<SqliteRuntimeStorage> {
  return SqliteRuntimeStorage.open(options);
}
