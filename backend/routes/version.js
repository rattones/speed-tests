const { Router } = require('express');
const fs = require('fs');
const path = require('path');

const REMOTE_MANIFEST_URL = 'https://raw.githubusercontent.com/rattones/speed-tests/master/manifest.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h — evita consultar o GitHub a cada carregamento
const FETCH_TIMEOUT_MS = 5000;

const router = Router();

// manifest.json fica na raiz do projeto: no container é montado/copiado em
// /app/manifest.json; rodando direto da pasta backend/, está em ../manifest.json.
// Fallback para o package.json do backend, que segue a mesma versão.
function readLocalVersion() {
  const candidates = [
    path.join(__dirname, '..', 'manifest.json'),
    path.join(__dirname, '..', '..', 'manifest.json'),
    path.join(__dirname, '..', 'package.json'),
  ];
  for (const file of candidates) {
    try {
      const { version } = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (version) return version;
    } catch { /* tenta o próximo */ }
  }
  return null;
}

// Compara versões semver (só a parte numérica). Retorna >0 se a > b.
function compareVersions(a, b) {
  const pa = String(a).split('-')[0].split('.').map(Number);
  const pb = String(b).split('-')[0].split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

let cache = { at: 0, latest: null };

async function fetchLatestVersion() {
  if (Date.now() - cache.at < CACHE_TTL_MS) return cache.latest;
  let latest = null;
  try {
    const res = await fetch(REMOTE_MANIFEST_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    latest = (await res.json()).version || null;
  } catch (err) {
    console.warn('[VERSION] Falha ao consultar versão no GitHub:', err.message);
  }
  cache = { at: Date.now(), latest };
  return latest;
}

// GET /api/version → { current, latest, updateAvailable }
// `latest` é null quando o GitHub não respondeu; nesse caso não há aviso.
router.get('/', async (_req, res) => {
  const current = readLocalVersion();
  const latest  = await fetchLatestVersion();
  const updateAvailable = !!(current && latest && compareVersions(latest, current) > 0);
  res.json({ current, latest, updateAvailable });
});

module.exports = router;
