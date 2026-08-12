# Changelog

Todas as alterações relevantes deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Unreleased] — F-0002

### Adicionado

#### Backend
- `db.js` — tabelas `wans` (nome, server ID, cor, limites de alerta, soft delete) e `app_settings` (chave-valor, guarda `cron_interval`); coluna `wan_id` em `speed_tests` (FK estável, substitui o vínculo por `interface_name` livre); migração automática e idempotente que popula `wans`/`app_settings` a partir do `.env` legado na primeira subida, com backfill de `wan_id` nos registros já existentes
- `configService.js` (novo) — módulo central de acesso a config: CRUD de WANs (`getWans`, `createWan`, `updateWan`, `deleteWan`), `getCronInterval`/`setCronInterval`, validação (nome/server ID obrigatórios, cor `#RRGGBB`, limites numéricos)
- `scheduler.js` — `runCycle()` itera sobre uma lista dinâmica de WANs (`getWans()`) lida a cada disparo, em vez de duas chamadas fixas; `reloadScheduler()` permite trocar o intervalo/lista de WANs em runtime, sem restart
- `routes/config.js` — CRUD completo (`GET/POST/PUT/DELETE /api/config/wans`, `GET/PUT /api/config` para o cron interval); toda mudança dispara `reloadScheduler()`
- `routes/tests.js` — `POST /api/tests/run` passa a receber `{ wanId }`; `GET /api/tests` filtra por `wan_id` numérico

### Alterado

#### Frontend
- `frontend/src/utils/color.js` (novo) — `deriveShades()` deriva os tons de upload/ping a partir da cor de download escolhida pelo usuário (hex → HSL, clareando progressivamente)
- `SpeedChart.vue` — props fixas `wan1Tests`/`wan2Tests`/`wan1Name`/`wan2Name` substituídas por uma prop única `wans` (array); séries, cores, eixos e stroke gerados dinamicamente para N WANs
- `WanCard.vue` — nova prop `color` (acento visual na borda esquerda do card) e `maxPing`
- `App.vue` — cards de status e gráfico passam a iterar sobre a lista de WANs vinda de `/api/config/wans` (`v-for`), no lugar de dois blocos fixos; novo botão de engrenagem no header abre o painel de configuração
- `ConfigPanel.vue` / `WanForm.vue` (novos) — UI de CRUD de WANs (nome, server ID, cor via `<input type="color">`, limites) com prévia dos tons derivados, e edição do intervalo de coleta

#### Configuração
- `.env.example` / `.env` — removidas `WAN1_*`, `WAN2_*`, `CRON_INTERVAL`; WANs e intervalo de coleta agora são configurados pela UI (ícone ⚙️), persistidos no banco

### Notas
- Não há mais limite fixo de 2 WANs — quantas forem cadastradas são testadas a cada ciclo
- Remover uma WAN com histórico faz soft delete (some da UI, testes antigos preservados); sem histórico, remove definitivamente

---

## [Unreleased] — B-0001

### Corrigido

#### Infraestrutura
- `docker-compose.yml` / `.env` — adicionada variável `TZ=America/Sao_Paulo` para que o timezone do container corresponda ao horário local do host

#### Backend
- `db.js` — `CURRENT_TIMESTAMP` substituído por `datetime('now', 'localtime')` nas tabelas `speed_tests` e `push_subscriptions`; o SQLite sempre armazenava em UTC, gerando +3 h no horário coletado
- `routes/tests.js` — cláusulas `datetime('now', ?)` ajustadas para `datetime('now', 'localtime', ?)` para manter consistência com os timestamps locais gravados
- `scheduler.js` — `created_at` passado explicitamente no INSERT com `datetime('now', 'localtime')`, evitando dependência do DEFAULT da tabela (que não é reavaliado pelo `CREATE TABLE IF NOT EXISTS` em bancos já existentes)

#### Frontend
- `SpeedChart.vue` — `new Date(t.created_at)` substituído por `new Date(t.created_at.replace(' ', 'T'))` para garantir parse como horário local em todos os browsers
- `WanCard.vue` — mesma correção na função `timeAgo()`
- `App.vue` — mesma correção na função `timeAgo()`

---

## [Unreleased] — F-0001

### Adicionado

#### Backend
- `scheduler.js` — `runTest` exportado para reuso externo ao scheduler
- `POST /api/tests/run` — endpoint para disparar medição manual de uma WAN específica; body `{ wan: 'wan1' | 'wan2' }`; retorna 400 (wan inválida), 503 (SERVER_ID não configurado) ou o resultado do teste

#### Frontend
- `WanCard.vue` — botão "Medir agora" no rodapé de cada card (presente com e sem dados); exibe spinner e texto "Medindo..." enquanto o teste corre; novas props `wanKey` e `measuring`
- `App.vue` — estado `wan1Measuring`/`wan2Measuring`; método `runTest(wanKey)` chama o endpoint, aguarda conclusão (~30 s) e atualiza os dados automaticamente

### Alterado

#### Frontend
- `SpeedChart.vue` — gráfico unificado exibindo download, upload e ping simultaneamente em 6 séries; WAN 1 em tons de azul (`#3B82F6`, `#93C5FD`, `#BFDBFE`), WAN 2 em tons de laranja (`#F59E0B`, `#FCD34D`, `#FDE68A`); download em linha sólida, upload tracejada, ping pontilhada; eixo Y duplo (Mbps à esquerda, ms à direita); removidos botões de filtro Download/Upload

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
