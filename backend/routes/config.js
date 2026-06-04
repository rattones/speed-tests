const { Router } = require('express');

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    wan1Name:        process.env.WAN1_NAME         || 'WAN_1',
    wan2Name:        process.env.WAN2_NAME         || 'WAN_2',
    wan1MinDownload: parseFloat(process.env.WAN1_MIN_DOWNLOAD || '0'),
    wan1MinUpload:   parseFloat(process.env.WAN1_MIN_UPLOAD   || '0'),
    wan2MinDownload: parseFloat(process.env.WAN2_MIN_DOWNLOAD || '0'),
    wan2MinUpload:   parseFloat(process.env.WAN2_MIN_UPLOAD   || '0'),
    cronInterval:    process.env.CRON_INTERVAL     || '*/15 * * * *',
    vapidPublicKey:  process.env.VAPID_PUBLIC_KEY  || '',
  });
});

module.exports = router;
