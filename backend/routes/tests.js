const { Router } = require('express');
const db = require('../db');

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

module.exports = router;
