const { Router } = require('express');
const configService = require('../configService');
const { reloadScheduler } = require('../scheduler');

const router = Router();

function toWanDTO(w) {
  return {
    id:          w.id,
    name:        w.name,
    serverId:    w.server_id,
    colorHex:    w.color_hex,
    minDownload: w.min_download,
    minUpload:   w.min_upload,
    maxPing:     w.max_ping,
    sortOrder:   w.sort_order,
    active:      !!w.active,
    createdAt:   w.created_at,
    updatedAt:   w.updated_at,
  };
}

function fromWanInput(body) {
  const data = {
    name:         body.name,
    server_id:    body.serverId,
    color_hex:    body.colorHex,
    min_download: Number(body.minDownload ?? 0),
    min_upload:   Number(body.minUpload   ?? 0),
    max_ping:     Number(body.maxPing     ?? 0),
    sort_order:   Number(body.sortOrder   ?? 0),
  };
  if (typeof body.active === 'boolean') data.active = body.active ? 1 : 0;
  return data;
}

function handleError(res, err) {
  if (err.status) return res.status(err.status).json({ error: err.message });
  console.error('[CONFIG]', err);
  return res.status(500).json({ error: 'Erro interno' });
}

router.get('/', (_req, res) => {
  res.json({ cronInterval: configService.getCronInterval() });
});

router.put('/', (req, res) => {
  try {
    configService.setCronInterval(req.body.cronInterval);
    reloadScheduler();
    res.json({ cronInterval: configService.getCronInterval() });
  } catch (err) {
    handleError(res, err);
  }
});

router.get('/wans', (req, res) => {
  const includeInactive = req.query.all === '1';
  res.json({ data: configService.getWans({ includeInactive }).map(toWanDTO) });
});

router.post('/wans', (req, res) => {
  try {
    const wan = configService.createWan(fromWanInput(req.body));
    reloadScheduler();
    res.status(201).json({ data: toWanDTO(wan) });
  } catch (err) {
    handleError(res, err);
  }
});

router.put('/wans/:id', (req, res) => {
  try {
    const wan = configService.updateWan(Number(req.params.id), fromWanInput(req.body));
    reloadScheduler();
    res.json({ data: toWanDTO(wan) });
  } catch (err) {
    handleError(res, err);
  }
});

router.delete('/wans/:id', (req, res) => {
  try {
    const force = req.query.force === '1';
    const result = configService.deleteWan(Number(req.params.id), { force });
    reloadScheduler();
    res.json(result);
  } catch (err) {
    handleError(res, err);
  }
});

module.exports = router;
