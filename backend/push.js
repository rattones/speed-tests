const webpush = require('web-push');
const db = require('./db');

const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_MAILTO } = process.env;

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_MAILTO) {
  try {
    webpush.setVapidDetails(VAPID_MAILTO, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidConfigured = true;
  } catch (err) {
    console.warn('[PUSH] Falha ao configurar VAPID:', err.message);
  }
} else {
  console.warn('[PUSH] Chaves VAPID não configuradas — alertas push desabilitados.');
}

const removeSubscription = db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ?');
const listSubscriptions = db.prepare('SELECT endpoint, subscription_json FROM push_subscriptions');

async function sendAlert(wanName, downloadMbps, uploadMbps) {
  if (!vapidConfigured) return;

  const payload = JSON.stringify({
    title: `Alerta de Velocidade — ${wanName}`,
    body: `${wanName} abaixo do limite! ↓${downloadMbps.toFixed(1)} Mbps ↑${uploadMbps.toFixed(1)} Mbps`,
    icon: '/icon.png',
  });

  const rows = listSubscriptions.all();
  if (rows.length === 0) return;

  console.log(`[PUSH] Disparando alerta para ${rows.length} inscrição(ões): ${wanName}`);

  for (const row of rows) {
    let subscription;
    try {
      subscription = JSON.parse(row.subscription_json);
    } catch {
      console.warn(`[PUSH] Subscription inválida para endpoint: ${row.endpoint} — removendo.`);
      removeSubscription.run(row.endpoint);
      continue;
    }

    try {
      await webpush.sendNotification(subscription, payload);
      console.log(`[PUSH] Notificação enviada: ${row.endpoint.substring(0, 60)}...`);
    } catch (err) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        console.log(`[PUSH] Subscription expirada (${err.statusCode}) — removendo: ${row.endpoint.substring(0, 60)}...`);
        removeSubscription.run(row.endpoint);
      } else {
        console.error(`[PUSH] Erro ao enviar para ${row.endpoint.substring(0, 60)}...:`, err.message);
      }
    }
  }
}

module.exports = { sendAlert };
