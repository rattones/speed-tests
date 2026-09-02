const { Router } = require('express');
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const deviceService = require('../deviceService');

const router = Router();

const MAX_BYTES = Math.max(
  1024,
  parseInt(process.env.LAN_TEST_MAX_BYTES || String(100 * 1024 * 1024), 10) || 100 * 1024 * 1024
);

// JSON parser local — o server.js monta este router ANTES do express.json() global
// justamente para que /download e /upload não sofram parsing de corpo.
// `verify` guarda o corpo cru para conseguir logar payloads malformados (ex.:
// agentes que enviam JSON com campo vazio: {"download":,"upload":...}).
const jsonParser = express.json({
  limit: '1mb',
  verify: (req, _res, buf) => { req.rawBody = buf.toString('utf8'); },
});

function jsonBody(req, res, next) {
  jsonParser(req, res, (err) => {
    if (err) {
      console.error(
        `[LAN] JSON inválido em ${req.method} ${req.originalUrl} de ${req.ip}: ${err.message}\n` +
        `[LAN] corpo recebido: ${req.rawBody ?? '(vazio)'}`
      );
      return res.status(400).json({
        error: 'JSON inválido no corpo da requisição',
        detail: err.message,
      });
    }
    next();
  });
}

// ── Endpoints de medição ───────────────────────────────────────────────────

// Mede RTT: resposta vazia, o mais barata possível.
router.get('/ping', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.status(204).end();
});

// Envia N bytes aleatórios (stream, sem alocar tudo em memória).
router.get('/download', (req, res) => {
  let bytes = parseInt(req.query.bytes, 10);
  if (!Number.isFinite(bytes) || bytes <= 0) bytes = 8 * 1024 * 1024;
  if (bytes > MAX_BYTES) bytes = MAX_BYTES;

  res.set({
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(bytes),
    'Cache-Control': 'no-store',
  });

  const CHUNK = 64 * 1024;
  let sent = 0;
  function pump() {
    while (sent < bytes) {
      const size = Math.min(CHUNK, bytes - sent);
      const ok = res.write(crypto.randomBytes(size));
      sent += size;
      if (!ok) {
        res.once('drain', pump);
        return;
      }
    }
    res.end();
  }
  pump();
});

// Consome e descarta o corpo, cronometrando.
router.post('/upload', (req, res) => {
  const t0 = process.hrtime.bigint();
  let bytes = 0;
  req.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > MAX_BYTES) req.destroy();
  });
  req.on('end', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    res.set('Cache-Control', 'no-store');
    res.json({ bytes, ms });
  });
  req.on('error', () => {
    if (!res.headersSent) res.status(400).json({ error: 'upload interrompido' });
  });
});

// ── Ingestão de resultados do agente ───────────────────────────────────────

const insertLanTest = db.prepare(`
  INSERT INTO lan_tests (device_id, device_name, download_mbps, upload_mbps, ping_ms, jitter_ms, created_at)
  VALUES (@device_id, @device_name, @download_mbps, @upload_mbps, @ping_ms, @jitter_ms, datetime('now', 'localtime'))
`);

router.post('/results', jsonBody, (req, res) => {
  const b = req.body || {};

  const num = (v) => {
    // aceita string com vírgula decimal (agentes em locale pt-BR/de-DE/etc.)
    const n = typeof v === 'string' ? Number(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };

  const download = num(b.download);
  const upload = num(b.upload);
  const ping = num(b.ping);
  const jitter = b.jitter == null ? null : num(b.jitter);

  if (download === null || upload === null || ping === null) {
    return res.status(400).json({ error: 'download, upload e ping são obrigatórios (número >= 0)' });
  }
  if (!b.machineId) {
    return res.status(400).json({ error: 'machineId é obrigatório' });
  }

  let device;
  try {
    device = deviceService.upsertDevice({
      machine_id: b.machineId,
      hostname: b.hostname,
      os: b.os,
      conn_type: b.connType,
      name: b.name,
    });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }

  insertLanTest.run({
    device_id: device.id,
    device_name: device.name,
    download_mbps: download,
    upload_mbps: upload,
    ping_ms: ping,
    jitter_ms: jitter,
  });

  res.status(201).json({
    deviceId: device.id,
    name: device.name,
    download_mbps: download,
    upload_mbps: upload,
    ping_ms: ping,
    jitter_ms: jitter,
  });
});

// ── Histórico ──────────────────────────────────────────────────────────────

const TEST_COLS = `id, device_id, device_name, download_mbps, upload_mbps, ping_ms, jitter_ms, created_at`;

router.get('/tests', (req, res) => {
  const { from, to, device } = req.query;
  let rows;

  if (from && to) {
    const base = `SELECT ${TEST_COLS} FROM lan_tests WHERE created_at >= ? AND created_at <= ?`;
    if (device) {
      rows = db.prepare(`${base} AND device_id = ? ORDER BY created_at ASC`).all(from, to, Number(device));
    } else {
      rows = db.prepare(`${base} ORDER BY created_at ASC`).all(from, to);
    }
  } else {
    let days = parseInt(req.query.days, 10);
    if (isNaN(days) || days <= 0) days = 1;
    if (days > 90) days = 90;

    if (device) {
      rows = db.prepare(`
        SELECT ${TEST_COLS} FROM lan_tests
        WHERE created_at >= datetime('now', 'localtime', ?) AND device_id = ?
        ORDER BY created_at ASC
      `).all(`-${days} days`, Number(device));
    } else {
      rows = db.prepare(`
        SELECT ${TEST_COLS} FROM lan_tests
        WHERE created_at >= datetime('now', 'localtime', ?)
        ORDER BY created_at ASC
      `).all(`-${days} days`);
    }
  }

  res.json({ data: rows, count: rows.length });
});

// ── CRUD de dispositivos ───────────────────────────────────────────────────

function toDeviceDTO(d) {
  return {
    id:          d.id,
    machineId:   d.machine_id,
    name:        d.name,
    hostname:    d.hostname,
    os:          d.os,
    connType:    d.conn_type,
    colorHex:    d.color_hex,
    minDownload: d.min_download,
    minUpload:   d.min_upload,
    maxPing:     d.max_ping,
    sortOrder:   d.sort_order,
    active:      !!d.active,
    lastSeenAt:  d.last_seen_at,
    createdAt:   d.created_at,
    updatedAt:   d.updated_at,
  };
}

function fromDeviceInput(body) {
  const data = {
    name:         body.name,
    color_hex:    body.colorHex,
    min_download: Number(body.minDownload ?? 0),
    min_upload:   Number(body.minUpload ?? 0),
    max_ping:     Number(body.maxPing ?? 0),
    sort_order:   Number(body.sortOrder ?? 0),
  };
  if (typeof body.active === 'boolean') data.active = body.active ? 1 : 0;
  if (body.machineId) data.machine_id = body.machineId;
  return data;
}

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('[LAN]', err);
  return res.status(500).json({ error: 'Erro interno' });
}

router.get('/devices', (req, res) => {
  const includeInactive = req.query.all === '1';
  res.json({ data: deviceService.getDevices({ includeInactive }).map(toDeviceDTO) });
});

router.post('/devices', jsonBody, (req, res) => {
  try {
    const device = deviceService.createDevice(fromDeviceInput(req.body));
    res.status(201).json({ data: toDeviceDTO(device) });
  } catch (err) {
    handleError(res, err);
  }
});

router.put('/devices/:id', jsonBody, (req, res) => {
  try {
    const device = deviceService.updateDevice(Number(req.params.id), fromDeviceInput(req.body));
    res.json({ data: toDeviceDTO(device) });
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/devices/:id', (req, res) => {
  try {
    const force = req.query.force === '1';
    const result = deviceService.deleteDevice(Number(req.params.id), { force });
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

// ── Download do agente de monitoramento ────────────────────────────────────

const AGENTS = {
  linux:   { file: 'lan-monitor.sh',  name: 'lan-monitor.sh',  type: 'text/x-shellscript' },
  macos:   { file: 'lan-monitor.sh',  name: 'lan-monitor.sh',  type: 'text/x-shellscript' },
  windows: { file: 'lan-monitor.ps1', name: 'lan-monitor.ps1', type: 'text/plain' },
};

router.get('/agent/:os', (req, res) => {
  const agent = AGENTS[String(req.params.os).toLowerCase()];
  if (!agent) return res.status(404).json({ error: 'SO inválido (use linux, macos ou windows)' });

  const filePath = path.join(__dirname, '..', 'scripts', agent.file);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Script não encontrado' });

  res.set({
    'Content-Type': agent.type,
    'Content-Disposition': `attachment; filename="${agent.name}"`,
    'Cache-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
});

module.exports = router;
