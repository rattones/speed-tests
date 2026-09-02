/**
 * Lógica de medição de velocidade da rede local (cliente ↔ servidor).
 *
 * Isomórfica: recebe um `fetchImpl` (o `fetch` do browser ou um polyfill no Node)
 * e uma `baseUrl` apontando para o backend. O backend não usa este módulo em
 * runtime — ele existe como a referência única da matemática que:
 *   - `frontend/src/lanMeasure.js` reexporta para o botão "Testar deste computador";
 *   - os scripts `lan-monitor.sh` / `lan-monitor.ps1` reimplementam em bash/pwsh.
 *
 * Endpoints usados (ver `backend/routes/lan.js`):
 *   GET  /api/lan/ping                → 204 vazio (mede RTT)
 *   GET  /api/lan/download?bytes=N    → N bytes aleatórios
 *   POST /api/lan/upload  (corpo)     → { bytes, ms }
 */

const PING_SAMPLES = 12;
const DEFAULT_DURATION_MS = 5000;
const DOWNLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB por requisição
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024; // 4 MB por requisição

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function stddev(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

function toMbps(bytes, ms) {
  if (ms <= 0) return 0;
  return (bytes * 8) / (ms / 1000) / 1_000_000;
}

async function measurePing({ baseUrl, fetchImpl, samples = PING_SAMPLES }) {
  const times = [];
  for (let i = 0; i < samples; i++) {
    const t0 = performance.now();
    await fetchImpl(`${baseUrl}/api/lan/ping?_=${Date.now()}-${i}`, { cache: 'no-store' });
    times.push(performance.now() - t0);
  }
  // descarta a primeira amostra (aquecimento de conexão)
  const warm = times.length > 1 ? times.slice(1) : times;
  return { ping_ms: mean(warm), jitter_ms: stddev(warm) };
}

async function measureDownload({ baseUrl, fetchImpl, durationMs = DEFAULT_DURATION_MS, onProgress }) {
  const deadline = performance.now() + durationMs;
  let totalBytes = 0;
  const t0 = performance.now();
  while (performance.now() < deadline) {
    const res = await fetchImpl(
      `${baseUrl}/api/lan/download?bytes=${DOWNLOAD_CHUNK_BYTES}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    const buf = await res.arrayBuffer();
    totalBytes += buf.byteLength;
    if (onProgress) onProgress(toMbps(totalBytes, performance.now() - t0));
  }
  return { download_mbps: toMbps(totalBytes, performance.now() - t0) };
}

async function measureUpload({
  baseUrl,
  fetchImpl,
  durationMs = DEFAULT_DURATION_MS,
  makePayload,
  onProgress,
}) {
  const payload = makePayload(UPLOAD_CHUNK_BYTES);
  const deadline = performance.now() + durationMs;
  let totalBytes = 0;
  const t0 = performance.now();
  while (performance.now() < deadline) {
    await fetchImpl(`${baseUrl}/api/lan/upload?_=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    totalBytes += UPLOAD_CHUNK_BYTES;
    if (onProgress) onProgress(toMbps(totalBytes, performance.now() - t0));
  }
  return { upload_mbps: toMbps(totalBytes, performance.now() - t0) };
}

/**
 * Roda o teste completo: ping → download → upload.
 * @param {object} opts
 * @param {string} opts.baseUrl        Origem do backend (ex. http://192.168.1.10:8020)
 * @param {Function} opts.fetchImpl    Implementação de fetch
 * @param {Function} opts.makePayload  (bytes) => corpo p/ upload (Blob/Buffer/…)
 * @param {number}  [opts.durationMs]  Duração de cada fase de throughput
 * @param {Function} [opts.onPhase]    (phaseName) => void  — 'ping'|'download'|'upload'
 * @param {Function} [opts.onProgress] (phaseName, mbps) => void
 */
async function measure({ baseUrl, fetchImpl, makePayload, durationMs, onPhase, onProgress }) {
  const base = String(baseUrl).replace(/\/$/, '');

  if (onPhase) onPhase('ping');
  const ping = await measurePing({ baseUrl: base, fetchImpl });

  if (onPhase) onPhase('download');
  const down = await measureDownload({
    baseUrl: base,
    fetchImpl,
    durationMs,
    onProgress: onProgress ? (m) => onProgress('download', m) : undefined,
  });

  if (onPhase) onPhase('upload');
  const up = await measureUpload({
    baseUrl: base,
    fetchImpl,
    durationMs,
    makePayload,
    onProgress: onProgress ? (m) => onProgress('upload', m) : undefined,
  });

  return {
    download_mbps: Number(down.download_mbps.toFixed(2)),
    upload_mbps: Number(up.upload_mbps.toFixed(2)),
    ping_ms: Number(ping.ping_ms.toFixed(2)),
    jitter_ms: Number(ping.jitter_ms.toFixed(2)),
  };
}

module.exports = {
  measure,
  measurePing,
  measureDownload,
  measureUpload,
  toMbps,
  DOWNLOAD_CHUNK_BYTES,
  UPLOAD_CHUNK_BYTES,
};
