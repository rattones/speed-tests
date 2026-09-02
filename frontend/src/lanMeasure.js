/**
 * Medição de velocidade da rede local, versão browser (usa `fetch` nativo).
 *
 * Mesma matemática de `backend/lanMeasure.js` — mantida aqui como cópia porque
 * os `<script>` dos SFCs carregados pelo vue3-sfc-loader não são ES modules e
 * não podem usar `import`. Exposto em `window.__LAN_MEASURE__` pelo main.js.
 *
 * Este teste é EFÊMERO: só exibe o resultado na tela. Não envia nada ao
 * servidor nem cria dispositivo — persistência é só via os scripts standalone.
 */

const PING_SAMPLES = 12;
const DEFAULT_PHASE_MS = 5000;
const DOWNLOAD_CHUNK_BYTES = 8 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 4 * 1024 * 1024;

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

async function measurePing(baseUrl) {
  const times = [];
  for (let i = 0; i < PING_SAMPLES; i++) {
    const t0 = performance.now();
    await fetch(`${baseUrl}/api/lan/ping?_=${Date.now()}-${i}`, { cache: 'no-store' });
    times.push(performance.now() - t0);
  }
  const warm = times.slice(1);
  return { ping_ms: mean(warm), jitter_ms: stddev(warm) };
}

async function measureDownload(baseUrl, phaseMs, onProgress) {
  const deadline = performance.now() + phaseMs;
  let total = 0;
  const t0 = performance.now();
  while (performance.now() < deadline) {
    const res = await fetch(
      `${baseUrl}/api/lan/download?bytes=${DOWNLOAD_CHUNK_BYTES}&_=${Date.now()}`,
      { cache: 'no-store' }
    );
    const buf = await res.arrayBuffer();
    total += buf.byteLength;
    if (onProgress) onProgress(toMbps(total, performance.now() - t0));
  }
  return toMbps(total, performance.now() - t0);
}

async function measureUpload(baseUrl, phaseMs, onProgress) {
  const payload = new Uint8Array(UPLOAD_CHUNK_BYTES);
  // preenche com ruído para evitar qualquer compressão de transporte
  for (let i = 0; i < payload.length; i += 4096) payload[i] = (Math.random() * 256) | 0;
  const deadline = performance.now() + phaseMs;
  let total = 0;
  const t0 = performance.now();
  while (performance.now() < deadline) {
    await fetch(`${baseUrl}/api/lan/upload?_=${Date.now()}`, {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload,
    });
    total += UPLOAD_CHUNK_BYTES;
    if (onProgress) onProgress(toMbps(total, performance.now() - t0));
  }
  return toMbps(total, performance.now() - t0);
}

/**
 * @param {object} [opts]
 * @param {string}   [opts.baseUrl]     default window.location.origin
 * @param {number}   [opts.phaseMs]     duração de cada fase de throughput
 * @param {Function} [opts.onPhase]     (name) => void — 'ping'|'download'|'upload'|'done'
 * @param {Function} [opts.onProgress]  (name, mbps) => void
 * @returns {Promise<{download_mbps, upload_mbps, ping_ms, jitter_ms}>}
 */
export async function runLanTest(opts = {}) {
  const baseUrl = (opts.baseUrl || window.location.origin).replace(/\/$/, '');
  const phaseMs = opts.phaseMs || DEFAULT_PHASE_MS;
  const { onPhase, onProgress } = opts;

  if (onPhase) onPhase('ping');
  const ping = await measurePing(baseUrl);

  if (onPhase) onPhase('download');
  const download = await measureDownload(
    baseUrl,
    phaseMs,
    onProgress ? (m) => onProgress('download', m) : undefined
  );

  if (onPhase) onPhase('upload');
  const upload = await measureUpload(
    baseUrl,
    phaseMs,
    onProgress ? (m) => onProgress('upload', m) : undefined
  );

  if (onPhase) onPhase('done');
  return {
    download_mbps: Number(download.toFixed(2)),
    upload_mbps: Number(upload.toFixed(2)),
    ping_ms: Number(ping.ping_ms.toFixed(2)),
    jitter_ms: Number(ping.jitter_ms.toFixed(2)),
  };
}
