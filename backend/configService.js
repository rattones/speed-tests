const cron = require('node-cron');
const db = require('./db');

class ValidationError extends Error {
  constructor(msg) { super(msg); this.status = 400; }
}
class NotFoundError extends Error {
  constructor(msg) { super(msg); this.status = 404; }
}

const selectActiveWans = db.prepare(`SELECT * FROM wans WHERE active = 1 ORDER BY sort_order ASC, id ASC`);
const selectAllWans     = db.prepare(`SELECT * FROM wans ORDER BY sort_order ASC, id ASC`);
const selectWanById     = db.prepare(`SELECT * FROM wans WHERE id = ?`);

const insertWan = db.prepare(`
  INSERT INTO wans (name, server_id, color_hex, min_download, min_upload, max_ping, sort_order)
  VALUES (@name, @server_id, @color_hex, @min_download, @min_upload, @max_ping, @sort_order)
`);

const updateWanStmt = db.prepare(`
  UPDATE wans SET
    name = @name, server_id = @server_id, color_hex = @color_hex,
    min_download = @min_download, min_upload = @min_upload, max_ping = @max_ping,
    sort_order = @sort_order, active = @active, updated_at = datetime('now', 'localtime')
  WHERE id = @id
`);

const softDeleteWanStmt = db.prepare(
  `UPDATE wans SET active = 0, updated_at = datetime('now', 'localtime') WHERE id = ?`
);
const hardDeleteWanStmt = db.prepare(`DELETE FROM wans WHERE id = ?`);
const clearWanIdStmt    = db.prepare(`UPDATE speed_tests SET wan_id = NULL WHERE wan_id = ?`);
const countTestsForWan  = db.prepare(`SELECT COUNT(*) AS n FROM speed_tests WHERE wan_id = ?`);

const getSettingStmt = db.prepare(`SELECT value FROM app_settings WHERE key = ?`);
const upsertSettingStmt = db.prepare(`
  INSERT INTO app_settings (key, value, updated_at) VALUES (@key, @value, datetime('now', 'localtime'))
  ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = datetime('now', 'localtime')
`);

function getWans({ includeInactive = false } = {}) {
  return includeInactive ? selectAllWans.all() : selectActiveWans.all();
}

function getWanById(id) {
  return selectWanById.get(id);
}

function validateWan(w) {
  if (!w.name || !String(w.name).trim()) throw new ValidationError('name é obrigatório');
  if (!w.server_id || !String(w.server_id).trim()) throw new ValidationError('server_id é obrigatório');
  if (!/^#[0-9A-Fa-f]{6}$/.test(w.color_hex || '')) throw new ValidationError('color_hex inválido (use #RRGGBB)');
  for (const field of ['min_download', 'min_upload', 'max_ping']) {
    const v = w[field];
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0) {
      throw new ValidationError(`${field} deve ser um número >= 0`);
    }
  }
}

function createWan(data) {
  const row = { sort_order: 0, color_hex: '#3B82F6', min_download: 0, min_upload: 0, max_ping: 0, ...data };
  validateWan(row);
  const info = insertWan.run(row);
  return getWanById(info.lastInsertRowid);
}

function updateWan(id, data) {
  const existing = getWanById(id);
  if (!existing) throw new NotFoundError('WAN não encontrada');
  const merged = { ...existing, ...data, id };
  validateWan(merged);
  updateWanStmt.run(merged);
  return getWanById(id);
}

function deleteWan(id, { force = false } = {}) {
  const existing = getWanById(id);
  if (!existing) throw new NotFoundError('WAN não encontrada');

  const { n: testCount } = countTestsForWan.get(id);

  if (testCount > 0 && !force) {
    softDeleteWanStmt.run(id);
    return { deleted: 'soft', testCount };
  }

  const tx = db.transaction(() => {
    if (testCount > 0) clearWanIdStmt.run(id);
    hardDeleteWanStmt.run(id);
  });
  tx();
  return { deleted: 'hard', testCount };
}

function getCronInterval() {
  const row = getSettingStmt.get('cron_interval');
  return row ? row.value : '*/15 * * * *';
}

function setCronInterval(value) {
  if (!cron.validate(value)) throw new ValidationError(`Expressão cron inválida: "${value}"`);
  upsertSettingStmt.run({ key: 'cron_interval', value });
}

module.exports = {
  getWans,
  getWanById,
  createWan,
  updateWan,
  deleteWan,
  getCronInterval,
  setCronInterval,
  ValidationError,
  NotFoundError,
};
