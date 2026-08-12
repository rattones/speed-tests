const { Router } = require('express');
const db = require('../db');
const { runTest } = require('../scheduler');
const { getWanById } = require('../configService');

const router = Router();

router.get('/', (req, res) => {
  const { from, to, wan } = req.query;

  let rows;

  if (from && to) {
    const base = `
      SELECT id, interface_name, wan_id, download_mbps, upload_mbps, ping_ms, created_at
      FROM speed_tests
      WHERE created_at >= ? AND created_at <= ?
    `;
    if (wan) {
      rows = db.prepare(`${base} AND wan_id = ? ORDER BY created_at ASC`).all(from, to, Number(wan));
    } else {
      rows = db.prepare(`${base} ORDER BY created_at ASC`).all(from, to);
    }
  } else {
    let days = parseInt(req.query.days, 10);
    if (isNaN(days) || days <= 0) days = 1;
    if (days > 90) days = 90;

    if (wan) {
      rows = db.prepare(`
        SELECT id, interface_name, wan_id, download_mbps, upload_mbps, ping_ms, created_at
        FROM speed_tests
        WHERE created_at >= datetime('now', 'localtime', ?)
          AND wan_id = ?
        ORDER BY created_at ASC
      `).all(`-${days} days`, Number(wan));
    } else {
      rows = db.prepare(`
        SELECT id, interface_name, wan_id, download_mbps, upload_mbps, ping_ms, created_at
        FROM speed_tests
        WHERE created_at >= datetime('now', 'localtime', ?)
        ORDER BY created_at ASC
      `).all(`-${days} days`);
    }
  }

  res.json({ data: rows, count: rows.length });
});

// Dispara um teste manual para uma WAN específica
router.post('/run', async (req, res) => {
  const wanId = Number(req.body.wanId);

  if (!wanId) {
    return res.status(400).json({ error: 'wanId é obrigatório' });
  }

  const wan = getWanById(wanId);
  if (!wan || !wan.active) {
    return res.status(404).json({ error: 'WAN não encontrada' });
  }

  const result = await runTest(wan);
  if (!result) {
    return res.status(500).json({ error: `Falha ao executar teste em ${wan.name}` });
  }

  res.json(result);
});

module.exports = router;
