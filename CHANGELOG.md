# Changelog

Todas as alterações relevantes deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [1.0.0] — 2026-06-04

### Adicionado

#### Infraestrutura
- `Dockerfile` baseado em `node:20-slim` com instalação do `speedtest-cli` oficial da Ookla via repositório apt
- `docker-compose.yml` com mapeamento de portas `8020:8020`, volumes para código-fonte, SQLite e `.env`
- Volume nomeado `node_modules` para isolar dependências do container do volume de desenvolvimento
- `.env.example` com todos os grupos de variáveis documentados
- `.gitignore` cobrindo `.env`, `*.sqlite`, `*.db`, `data/` e `node_modules/`

#### Backend (Node.js + Express)
- `server.js` — entry point com Express, middlewares, rotas e fallback SPA
- `db.js` — inicialização do SQLite com WAL mode; tabelas `speed_tests` e `push_subscriptions`
- `scheduler.js` — cron job com `node-cron`; executa testes sequencialmente para WAN1 e WAN2; converte `bytes/s → Mbps` (`bandwidth * 8 / 1_000_000`)
- `push.js` — envio de Web Push com `web-push` (VAPID); limpeza automática de subscriptions expiradas (HTTP 410/404)
- `scripts/run_speedtest.sh` — wrapper Bash para `speedtest --accept-license --accept-gdpr --format=json --server-id=<ID>`
- `GET /api/tests` — histórico filtrado por dias (`?days=7`, máx. 90) e por WAN (`?wan=`)
- `GET /api/config` — configurações públicas sem expor chaves privadas
- `POST /api/push/register` — upsert idempotente de subscriptions push

#### Frontend (Vue 3 CDN + ApexCharts)
- `index.html` com import map para resolução de bare specifiers (`vue`, `apexcharts`)
- `main.js` com `vue3-sfc-loader@0.9.5` para carregar SFCs em runtime sem build step
- `App.vue` — layout principal com header, grid de cards, gráfico e footer
- `WanCard.vue` — card de status com indicador colorido (verde/vermelho), métricas e tempo relativo
- `SpeedChart.vue` — gráfico de linhas ApexCharts com toggle Download/Upload e duas séries (WAN1 azul, WAN2 âmbar)
- `AlertButton.vue` — ativação de push notifications com estados: `idle`, `loading`, `active`, `denied`, `unsupported`
- `sw.js` — Service Worker com listeners `install`, `activate`, `push` e `notificationclick`

### Corrigido

- `npm ci` substituído por `npm install --omit=dev` no Dockerfile (não havia `package-lock.json` inicial)
- `CRON_INTERVAL` no `.env` passou a exigir aspas para valores com espaços (ex: `"*/15 * * * *"`)
- CDN do `vue3-apexcharts` corrigido de `@1.4.1/dist/vue3-apexcharts.esm.js` (404) para `@1.11.1/dist/vue3-apexcharts.js`
- CDN do sfc-loader corrigido de `@vue/vue3-sfc-loader@0.8.4` (404) para `vue3-sfc-loader@0.9.5`
- `moduleCache.vue` do sfc-loader corrigido de função lazy (`() => import('vue')`) para referência direta (`Vue`) — resolve `createElementVNode is not a function`
- Imports de CDN dentro de SFCs processados pelo sfc-loader removidos; dependências partilhadas expostas via `window.__SFC__`
- `version: "3.8"` removido do `docker-compose.yml` (campo obsoleto nas versões recentes do Compose)
