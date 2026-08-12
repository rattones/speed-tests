const cron = require('node-cron');
const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const db = require('./db');
const { getWans, getCronInterval } = require('./configService');

const execFileAsync = promisify(execFile);
const scriptPath = path.join(__dirname, 'scripts', 'run_speedtest.sh');

const insertTest = db.prepare(`
  INSERT INTO speed_tests (interface_name, wan_id, download_mbps, upload_mbps, ping_ms, created_at)
  VALUES (@interface_name, @wan_id, @download_mbps, @upload_mbps, @ping_ms, datetime('now', 'localtime'))
`);

let activeTask = null;
let cycleRunning = false;

async function runTest(wan) {
  const { id: wanId, name: wanName, server_id: serverId } = wan;
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

    insertTest.run({ interface_name: wanName, wan_id: wanId, download_mbps, upload_mbps, ping_ms });

    console.log(
      `[SCHEDULER] ${wanName}: ↓${download_mbps.toFixed(1)} Mbps ` +
      `↑${upload_mbps.toFixed(1)} Mbps  ping:${ping_ms.toFixed(0)}ms`
    );

    return { wanId, wanName, download_mbps, upload_mbps, ping_ms };
  } catch (err) {
    console.error(`[SCHEDULER] Erro no teste de ${wanName}:`, err.message);
    return null;
  }
}

async function runCycle() {
  if (cycleRunning) {
    console.warn('[SCHEDULER] Ciclo anterior ainda em execução — pulando este disparo.');
    return;
  }
  cycleRunning = true;
  try {
    console.log(`[SCHEDULER] Ciclo iniciado em ${new Date().toISOString()}`);
    const wans = getWans();
    for (const wan of wans) {
      await runTest(wan);
    }
    console.log(`[SCHEDULER] Ciclo concluído em ${new Date().toISOString()}`);
  } finally {
    cycleRunning = false;
  }
}

function startScheduler() {
  const interval = getCronInterval();

  if (!cron.validate(interval)) {
    console.error(`[SCHEDULER] CRON_INTERVAL inválido: "${interval}" — scheduler não iniciado.`);
    return;
  }

  const wans = getWans();
  if (!wans.length) {
    console.warn('[SCHEDULER] Nenhuma WAN configurada — scheduler desabilitado até criar uma.');
    return;
  }

  console.log(`[SCHEDULER] Iniciando... Intervalo: ${interval}  WANs: ${wans.map((w) => w.name).join(', ')}`);
  activeTask = cron.schedule(interval, runCycle);
}

function reloadScheduler() {
  if (activeTask) {
    activeTask.stop();
    activeTask = null;
  }
  startScheduler();
}

module.exports = { startScheduler, reloadScheduler, runTest, runCycle };
