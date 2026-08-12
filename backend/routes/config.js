const { Router } = require('express');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const configService = require('../configService');
const { reloadScheduler } = require('../scheduler');

const execFileAsync = promisify(execFile);
const scriptPath = path.join(__dirname, '..', 'scripts', 'run_speedtest.sh');

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

// Roda um speedtest real contra o servidor informado para descobrir seu IP —
// a API pública do speedtest.net filtra por proximidade geográfica e não
// permite consultar um servidor arbitrário por ID sem rodar o teste.
router.get('/wans/lookup-ip', async (req, res) => {
  const serverId = String(req.query.serverId || '').trim();
  if (!serverId) {
    return res.status(400).json({ error: 'serverId é obrigatório' });
  }

  try {
    const { stdout } = await execFileAsync('bash', [scriptPath, serverId]);
    const result = JSON.parse(stdout);
    if (!result.server || !result.server.ip) {
      throw new Error('Resposta do speedtest não contém o IP do servidor');
    }
    res.json({
      ip:   result.server.ip,
      host: result.server.host,
      name: result.server.name,
    });
  } catch (err) {
    console.error('[CONFIG] Erro ao buscar IP do servidor:', err.message);
    res.status(502).json({ error: 'Não foi possível determinar o IP do servidor. Verifique o Server ID.' });
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
