// Creates the database (if missing) and applies schema.sql.
// Usage: node src/db/migrate.js [--fresh]
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { config } from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fresh = process.argv.includes('--fresh');

function splitStatements(sql) {
  // Strip line comments, then split on semicolons at statement boundaries.
  return sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function migrate({ log = console.log } = {}) {
  const { host, port, user, password, database } = config.db;

  // Connect without a database to (re)create it.
  const root = await mysql.createConnection({ host, port, user, password, multipleStatements: true });

  if (fresh) {
    log(`Dropping database \`${database}\` (fresh)…`);
    await root.query(`DROP DATABASE IF EXISTS \`${database}\``);
  }
  await root.query(
    `CREATE DATABASE IF NOT EXISTS \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`
  );
  await root.end();

  const conn = await mysql.createConnection({ host, port, user, password, database, multipleStatements: true });
  const schema = fs.readFileSync(path.resolve(__dirname, 'schema.sql'), 'utf8');
  for (const stmt of splitStatements(schema)) {
    await conn.query(stmt);
  }
  await conn.end();
  log('✅ Migration complete.');
}

// Run when invoked directly.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrate()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Migration failed:', err.message);
      process.exit(1);
    });
}
