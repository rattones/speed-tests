const cron = require('node-cron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const db = require('./db');
const push = require('./push');

const execFileAsync = promisify(execFile);
const scriptPath = path.join(__dirname, 'scripts', 'run_speedtest.sh');

const insertTest = db.prepare(`
  INSERT INTO speed_tests (interface_name, download_mbps, upload_mbps, ping_ms)
  VALUES (@interface_name, @download_mbps, @upload_mbps, @ping_ms)
`);

async function runTest(wanName, serverId, minDownload, minUpload) {
  try {
    const { stdout } = await execFileAsync('bash', [scriptPath, String(serverId)]);

    let result;
    try {
      result = JSON.parse(stdout);
    } catch {
      throw new Error(`JSON inválido retornado pelo speedtest: ${stdout.substring(0, 200)}`);
    }

    // A API da Ookla retorna bandwidth em bytes/s — converter para Mbps
    const download_mbps = (result.download.bandwidth * 8) / 1_000_000;
    const upload_mbps   = (result.upload.bandwidth   * 8) / 1_000_000;
    const ping_ms       = result.ping.latency;

    insertTest.run({ interface_name: wanName, download_mbps, upload_mbps, ping_ms });

    console.log(
      `[SCHEDULER] ${wanName}: ↓${download_mbps.toFixed(1)} Mbps ` +
      `↑${upload_mbps.toFixed(1)} Mbps  ping:${ping_ms.toFixed(0)}ms`
    );

    if (download_mbps < minDownload || upload_mbps < minUpload) {
      push.sendAlert(wanName, download_mbps, upload_mbps).catch((err) =>
        console.error('[SCHEDULER] Erro ao disparar alerta push:', err.message)
      );
    }

    return { wanName, download_mbps, upload_mbps, ping_ms };
  } catch (err) {
    console.error(`[SCHEDULER] Erro no teste de ${wanName}:`, err.message);
    return null;
  }
}

function startScheduler() {
  const interval = process.env.CRON_INTERVAL || '*/15 * * * *';

  const wan1Name      = process.env.WAN1_NAME        || 'WAN_1';
  const wan2Name      = process.env.WAN2_NAME        || 'WAN_2';
  const wan1ServerId  = process.env.WAN1_SERVER_ID;
  const wan2ServerId  = process.env.WAN2_SERVER_ID;
  const wan1MinDown   = parseFloat(process.env.WAN1_MIN_DOWNLOAD || '0');
  const wan1MinUp     = parseFloat(process.env.WAN1_MIN_UPLOAD   || '0');
  const wan2MinDown   = parseFloat(process.env.WAN2_MIN_DOWNLOAD || '0');
  const wan2MinUp     = parseFloat(process.env.WAN2_MIN_UPLOAD   || '0');

  if (!wan1ServerId || !wan2ServerId) {
    console.warn('[SCHEDULER] WAN1_SERVER_ID ou WAN2_SERVER_ID não configurados — scheduler desabilitado.');
    return;
  }

  if (!cron.validate(interval)) {
    console.error(`[SCHEDULER] CRON_INTERVAL inválido: "${interval}" — usando padrão */15 * * * *`);
  }

  console.log(`[SCHEDULER] Iniciando... Intervalo: ${interval}`);

  cron.schedule(interval, async () => {
    console.log(`[SCHEDULER] Ciclo iniciado em ${new Date().toISOString()}`);
    await runTest(wan1Name, wan1ServerId, wan1MinDown, wan1MinUp);
    await runTest(wan2Name, wan2ServerId, wan2MinDown, wan2MinUp);
    console.log(`[SCHEDULER] Ciclo concluído em ${new Date().toISOString()}`);
  });
}

module.exports = { startScheduler, runTest };
