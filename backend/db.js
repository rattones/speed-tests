const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || '/data/speed_tests.db';

const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS speed_tests (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    interface_name TEXT    NOT NULL,
    download_mbps  REAL    NOT NULL,
    upload_mbps    REAL    NOT NULL,
    ping_ms        REAL    NOT NULL,
    created_at     DATETIME DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS push_subscriptions (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    endpoint          TEXT    NOT NULL UNIQUE,
    subscription_json TEXT    NOT NULL,
    created_at        DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

console.log(`[DB] Banco de dados inicializado em: ${dbPath}`);

module.exports = db;
