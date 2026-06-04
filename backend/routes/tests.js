const { Router } = require('express');
const db = require('../db');
const { runTest } = require('../scheduler');

const router = Router();

router.get('/', (req, res) => {
  let days = parseInt(req.query.days, 10);
  if (isNaN(days) || days <= 0) days = 7;
  if (days > 90) days = 90;

  const wan = req.query.wan || null;

  let stmt;
  let rows;

  if (wan) {
    stmt = db.prepare(`
      SELECT id, interface_name, download_mbps, upload_mbps, ping_ms, created_at
      FROM speed_tests
      WHERE created_at >= datetime('now', ? )
        AND interface_name = ?
      ORDER BY created_at ASC
    `);
    rows = stmt.all(`-${days} days`, wan);
  } else {
    stmt = db.prepare(`
      SELECT id, interface_name, download_mbps, upload_mbps, ping_ms, created_at
      FROM speed_tests
      WHERE created_at >= datetime('now', ?)
      ORDER BY created_at ASC
    `);
    rows = stmt.all(`-${days} days`);
  }

  res.json({ data: rows, count: rows.length });
});

// Dispara um teste manual para uma WAN específica
router.post('/run', async (req, res) => {
  const { wan } = req.body;

  if (wan !== 'wan1' && wan !== 'wan2') {
    return res.status(400).json({ error: 'wan deve ser "wan1" ou "wan2"' });
  }

  const isWan1     = wan === 'wan1';
  const wanName    = isWan1 ? (process.env.WAN1_NAME || 'WAN_1')  : (process.env.WAN2_NAME || 'WAN_2');
  const serverId   = isWan1 ? process.env.WAN1_SERVER_ID          : process.env.WAN2_SERVER_ID;
  const minDown    = parseFloat(isWan1 ? (process.env.WAN1_MIN_DOWNLOAD || '0') : (process.env.WAN2_MIN_DOWNLOAD || '0'));
  const minUp      = parseFloat(isWan1 ? (process.env.WAN1_MIN_UPLOAD   || '0') : (process.env.WAN2_MIN_UPLOAD   || '0'));

  if (!serverId) {
    return res.status(503).json({ error: `SERVER_ID de ${wanName} não configurado` });
  }

  const result = await runTest(wanName, serverId, minDown, minUp);
  if (!result) {
    return res.status(500).json({ error: `Falha ao executar teste em ${wanName}` });
  }

  res.json(result);
});

module.exports = router;
