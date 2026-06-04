const { Router } = require('express');
const db = require('../db');

const router = Router();

const upsertSubscription = db.prepare(`
  INSERT OR IGNORE INTO push_subscriptions (endpoint, subscription_json)
  VALUES (?, ?)
`);

router.post('/register', (req, res) => {
  const subscription = req.body;

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ success: false, message: 'endpoint é obrigatório.' });
  }

  upsertSubscription.run(subscription.endpoint, JSON.stringify(subscription));

  res.json({ success: true, message: 'Registrado com sucesso.' });
});

module.exports = router;
