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

  CREATE TABLE IF NOT EXISTS wans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    server_id     TEXT    NOT NULL,
    color_hex     TEXT    NOT NULL DEFAULT '#3B82F6',
    min_download  REAL    NOT NULL DEFAULT 0,
    min_upload    REAL    NOT NULL DEFAULT 0,
    max_ping      REAL    NOT NULL DEFAULT 0,
    sort_order    INTEGER NOT NULL DEFAULT 0,
    active        INTEGER NOT NULL DEFAULT 1,
    created_at    DATETIME DEFAULT (datetime('now', 'localtime')),
    updated_at    DATETIME DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS app_settings (
    key         TEXT PRIMARY KEY,
    value       TEXT NOT NULL,
    updated_at  DATETIME DEFAULT (datetime('now', 'localtime'))
  );
`);

// ── Migração: coluna wan_id em speed_tests (vínculo estável com a tabela wans) ──
const speedTestsCols = db.prepare(`PRAGMA table_info(speed_tests)`).all();
if (!speedTestsCols.some((c) => c.name === 'wan_id')) {
  db.exec(`ALTER TABLE speed_tests ADD COLUMN wan_id INTEGER REFERENCES wans(id)`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_speed_tests_interface_name ON speed_tests(interface_name);
  CREATE INDEX IF NOT EXISTS idx_speed_tests_wan_id ON speed_tests(wan_id);
`);

// ── Migração: bootstrap de WANs a partir do .env (idempotente, roda só 1x) ──
function bootstrapWansFromEnv() {
  const { n: wanCount } = db.prepare(`SELECT COUNT(*) AS n FROM wans`).get();
  if (wanCount > 0) return;

  const insertWan = db.prepare(`
    INSERT INTO wans (name, server_id, color_hex, min_download, min_upload, max_ping, sort_order)
    VALUES (@name, @server_id, @color_hex, @min_download, @min_upload, @max_ping, @sort_order)
  `);
  const backfillWanId = db.prepare(`UPDATE speed_tests SET wan_id = ? WHERE interface_name = ?`);

  const candidates = [
    {
      name:         process.env.WAN1_NAME || 'WAN_1',
      server_id:    process.env.WAN1_SERVER_ID,
      color_hex:    '#3B82F6',
      min_download: parseFloat(process.env.WAN1_MIN_DOWNLOAD || '0'),
      min_upload:   parseFloat(process.env.WAN1_MIN_UPLOAD   || '0'),
      max_ping:     parseFloat(process.env.WAN1_MAX_PING     || '0'),
      sort_order:   1,
    },
    {
      name:         process.env.WAN2_NAME || 'WAN_2',
      server_id:    process.env.WAN2_SERVER_ID,
      color_hex:    '#F59E0B',
      min_download: parseFloat(process.env.WAN2_MIN_DOWNLOAD || '0'),
      min_upload:   parseFloat(process.env.WAN2_MIN_UPLOAD   || '0'),
      max_ping:     parseFloat(process.env.WAN2_MAX_PING     || '0'),
      sort_order:   2,
    },
  ].filter((w) => w.server_id);

  if (!candidates.length) return;

  const tx = db.transaction((rows) => {
    for (const w of rows) {
      const info = insertWan.run(w);
      backfillWanId.run(info.lastInsertRowid, w.name);
    }
  });
  tx(candidates);

  console.log(`[DB] Migração automática: ${candidates.length} WAN(s) criada(s) a partir do .env.`);
}
bootstrapWansFromEnv();

// ── Migração: bootstrap do cron_interval a partir do .env (idempotente) ──
function bootstrapCronInterval() {
  const existing = db.prepare(`SELECT value FROM app_settings WHERE key = 'cron_interval'`).get();
  if (existing) return;

  const value = process.env.CRON_INTERVAL || '*/15 * * * *';
  db.prepare(`INSERT INTO app_settings (key, value) VALUES ('cron_interval', ?)`).run(value);
  console.log(`[DB] Migração automática: cron_interval = "${value}"`);
}
bootstrapCronInterval();

console.log(`[DB] Banco de dados inicializado em: ${dbPath}`);

module.exports = db;
