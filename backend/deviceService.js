const db = require('./db');
const { ValidationError, NotFoundError } = require('./configService');

// Paleta de cores de acento para novos dispositivos (rotaciona por ordem de chegada).
// Evita que todos os devices nasçam com a mesma cor no gráfico.
const DEVICE_COLORS = [
  '#10B981', // emerald
  '#6366F1', // indigo
  '#EC4899', // pink
  '#F97316', // orange
  '#14B8A6', // teal
  '#8B5CF6', // violet
  '#EAB308', // yellow
  '#EF4444', // red
];

const selectActiveDevices = db.prepare(
  `SELECT * FROM devices WHERE active = 1 ORDER BY sort_order ASC, id ASC`
);
const selectAllDevices = db.prepare(
  `SELECT * FROM devices ORDER BY sort_order ASC, id ASC`
);
const selectDeviceById = db.prepare(`SELECT * FROM devices WHERE id = ?`);
const selectDeviceByMachineId = db.prepare(`SELECT * FROM devices WHERE machine_id = ?`);
const countDevices = db.prepare(`SELECT COUNT(*) AS n FROM devices`);
const maxSortOrder = db.prepare(`SELECT COALESCE(MAX(sort_order), 0) AS m FROM devices`);

const insertDevice = db.prepare(`
  INSERT INTO devices
    (machine_id, name, hostname, os, conn_type, color_hex,
     min_download, min_upload, max_ping, sort_order, last_seen_at)
  VALUES
    (@machine_id, @name, @hostname, @os, @conn_type, @color_hex,
     @min_download, @min_upload, @max_ping, @sort_order, datetime('now', 'localtime'))
`);

// Atualização vinda de um check-in do agente: mexe só nos metadados de sistema,
// nunca no nome/cor/limites que o usuário pode ter editado pela UI.
const touchDeviceStmt = db.prepare(`
  UPDATE devices SET
    hostname     = @hostname,
    os           = @os,
    conn_type    = @conn_type,
    last_seen_at = datetime('now', 'localtime'),
    updated_at   = datetime('now', 'localtime')
  WHERE id = @id
`);

const updateDeviceStmt = db.prepare(`
  UPDATE devices SET
    name = @name, color_hex = @color_hex,
    min_download = @min_download, min_upload = @min_upload, max_ping = @max_ping,
    sort_order = @sort_order, active = @active, updated_at = datetime('now', 'localtime')
  WHERE id = @id
`);

const hardDeleteDeviceStmt = db.prepare(`DELETE FROM devices WHERE id = ?`);
const deleteTestsForDeviceStmt = db.prepare(`DELETE FROM lan_tests WHERE device_id = ?`);
const countTestsForDevice = db.prepare(`SELECT COUNT(*) AS n FROM lan_tests WHERE device_id = ?`);

function getDevices({ includeInactive = false } = {}) {
  return includeInactive ? selectAllDevices.all() : selectActiveDevices.all();
}

function getDeviceById(id) {
  return selectDeviceById.get(id);
}

function getDeviceByMachineId(machineId) {
  return selectDeviceByMachineId.get(machineId);
}

function normalizeMachineId(raw) {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^0-9a-f]/g, '');
}

function validateDevice(d) {
  if (!d.name || !String(d.name).trim()) throw new ValidationError('name é obrigatório');
  if (!/^#[0-9A-Fa-f]{6}$/.test(d.color_hex || '')) {
    throw new ValidationError('color_hex inválido (use #RRGGBB)');
  }
  for (const field of ['min_download', 'min_upload', 'max_ping']) {
    const v = d[field];
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0) {
      throw new ValidationError(`${field} deve ser um número >= 0`);
    }
  }
}

// Cria (auto-registro) ou faz check-in de um dispositivo a partir de um resultado
// enviado pelo agente. Retorna a linha do device.
function upsertDevice({ machine_id, hostname, os, conn_type, name }) {
  const machineId = normalizeMachineId(machine_id);
  if (!machineId) throw new ValidationError('machineId inválido');

  const existing = getDeviceByMachineId(machineId);
  const meta = {
    hostname: hostname ? String(hostname).slice(0, 120) : null,
    os:       os ? String(os).slice(0, 20) : null,
    conn_type: conn_type ? String(conn_type).slice(0, 20) : 'unknown',
  };

  if (existing) {
    touchDeviceStmt.run({ id: existing.id, ...meta });
    return getDeviceById(existing.id);
  }

  // `name` (opcional) só é usado no primeiro registro — depois disso o nome é
  // gerido pela UI e o agente não o sobrescreve.
  const initialName =
    (name && String(name).trim().slice(0, 120)) || meta.hostname || machineId;

  const { n } = countDevices.get();
  const { m } = maxSortOrder.get();
  const info = insertDevice.run({
    machine_id:  machineId,
    name:        initialName,
    hostname:    meta.hostname,
    os:          meta.os,
    conn_type:   meta.conn_type,
    color_hex:   DEVICE_COLORS[n % DEVICE_COLORS.length],
    min_download: 0,
    min_upload:   0,
    max_ping:     0,
    sort_order:   m + 1,
  });
  return getDeviceById(info.lastInsertRowid);
}

function createDevice(data) {
  const machineId = normalizeMachineId(data.machine_id);
  if (!machineId) throw new ValidationError('machine_id inválido');
  if (getDeviceByMachineId(machineId)) {
    throw new ValidationError('Já existe um dispositivo com esse machine_id');
  }
  const { m } = maxSortOrder.get();
  const row = {
    machine_id:   machineId,
    name:         data.name,
    hostname:     data.hostname || null,
    os:           data.os || null,
    conn_type:    data.conn_type || 'unknown',
    color_hex:    data.color_hex || '#10B981',
    min_download: Number(data.min_download ?? 0),
    min_upload:   Number(data.min_upload ?? 0),
    max_ping:     Number(data.max_ping ?? 0),
    sort_order:   Number.isFinite(data.sort_order) ? data.sort_order : m + 1,
  };
  validateDevice(row);
  const info = insertDevice.run(row);
  return getDeviceById(info.lastInsertRowid);
}

function updateDevice(id, data) {
  const existing = getDeviceById(id);
  if (!existing) throw new NotFoundError('Dispositivo não encontrado');
  const merged = {
    ...existing,
    ...data,
    id,
  };
  merged.min_download = Number(merged.min_download);
  merged.min_upload = Number(merged.min_upload);
  merged.max_ping = Number(merged.max_ping);
  merged.sort_order = Number(merged.sort_order);
  merged.active = merged.active ? 1 : 0;
  validateDevice(merged);
  updateDeviceStmt.run(merged);
  return getDeviceById(id);
}

// Remove o dispositivo e todo o seu histórico de medições em definitivo —
// diferente de WANs, aqui não há soft delete: "Remover" apaga tudo de uma vez.
function deleteDevice(id) {
  const existing = getDeviceById(id);
  if (!existing) throw new NotFoundError('Dispositivo não encontrado');

  const { n: testCount } = countTestsForDevice.get(id);

  const tx = db.transaction(() => {
    if (testCount > 0) deleteTestsForDeviceStmt.run(id);
    hardDeleteDeviceStmt.run(id);
  });
  tx();
  return { deleted: 'hard', testCount };
}

module.exports = {
  getDevices,
  getDeviceById,
  getDeviceByMachineId,
  normalizeMachineId,
  upsertDevice,
  createDevice,
  updateDevice,
  deleteDevice,
};
