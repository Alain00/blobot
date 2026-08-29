import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.js';

export type BlobotDatabase = BetterSQLite3Database<typeof schema>;

export interface OpenDatabaseOptions {
  /** A file path, or `:memory:` for tests. */
  readonly path: string;
  readonly migrationsFolder?: string;
}

export interface OpenedDatabase {
  readonly db: BlobotDatabase;
  close(): void;
}

/**
 * One connection, in the Electron main process. **The renderer never touches the database** —
 * "the UI is provider-agnostic" only holds if the UI cannot reach the table where `runtime_id`
 * is written, and a renderer with a handle is a renderer that will eventually filter on it.
 *
 * WAL because the demo streams events while the UI reads the same tables, and `foreign_keys`
 * explicitly because SQLite defaults it **off** per connection and the tombstone design
 * assumes the constraints are real.
 */
export function openDatabase(options: OpenDatabaseOptions): OpenedDatabase {
  const connection = new Database(options.path);
  connection.pragma('journal_mode = WAL');
  connection.pragma('foreign_keys = ON');

  const db = drizzle(connection, { schema });
  migrate(db, {
    migrationsFolder:
      options.migrationsFolder ?? fileURLToPath(new URL('../../migrations', import.meta.url)),
  });
  return {
    db,
    close: () => connection.close(),
  };
}
