# Changelog

Todas as alterações relevantes deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Não lançado]

### Alterado

#### Frontend
- `SpeedChart.vue` — eixo Y fixo de 0 a 800 (Mbps para download/upload, ms para ping), mesma régua de valores para as três métricas; tooltip customizado ao passar o mouse agrupa, por WAN, o ponto mais próximo do instante sob o cursor (tolerância de 2min), com separador tracejado entre grupos de WAN

---

## [2.0.0] — 2026-08-13

Configuração de WANs migrada de variáveis de ambiente fixas (`WAN1_*`/`WAN2_*`) para cadastro dinâmico via banco de dados e UI — deployments anteriores que dependiam dessas variáveis precisam passar pela migração automática descrita em "Configuração" abaixo. Por isso, major version.

### Adicionado

#### Backend
- `db.js` — tabelas `wans` (nome, server ID, cor, limites de alerta, ordem de exibição, soft delete) e `app_settings` (chave-valor, guarda `cron_interval`); coluna `wan_id` em `speed_tests` (FK estável, substitui o vínculo por `interface_name` livre); migração automática e idempotente que popula `wans`/`app_settings` a partir do `.env` legado na primeira subida, com backfill de `wan_id` nos registros já existentes
- `configService.js` (novo) — módulo central de acesso a config: CRUD de WANs (`getWans`, `createWan`, `updateWan`, `deleteWan`), `getCronInterval`/`setCronInterval`, validação (nome/server ID obrigatórios, cor `#RRGGBB`, limites numéricos)
- `scheduler.js` — `runCycle()` itera sobre uma lista dinâmica de WANs (`getWans()`) lida a cada disparo, em vez de duas chamadas fixas; `reloadScheduler()` permite trocar o intervalo/lista de WANs em runtime, sem restart; `runTest` exportado para reuso externo ao scheduler
- `routes/config.js` — CRUD completo (`GET/POST/PUT/DELETE /api/config/wans`, `GET/PUT /api/config` para o cron interval); toda mudança dispara `reloadScheduler()`
- `routes/tests.js` — `GET /api/tests` filtra por `wan_id` numérico
- `POST /api/tests/run` — endpoint para disparar medição manual de uma WAN específica (`{ wanId }`); retorna 400 (WAN inválida), 503 (server ID não configurado) ou o resultado do teste

#### Frontend
- `frontend/src/utils/color.js` (novo) — `deriveShades()` deriva os tons de upload/ping a partir da cor de download escolhida pelo usuário (hex → HSL, clareando progressivamente)
- `ConfigPanel.vue` / `WanForm.vue` (novos) — UI de CRUD de WANs (nome, server ID, cor via `<input type="color">`, limites de alerta, ordem de exibição) com prévia dos tons derivados, edição do intervalo de coleta e texto explicativo do formato cron (`minuto hora dia-do-mês mês dia-da-semana`, `*` e `*/N`, com exemplo)
- `WanCard.vue` — botão "Medir agora" no rodapé de cada card, com spinner enquanto o teste corre; badge numérico circular no header exibindo a ordem de exibição (`sortOrder`) no carrossel; checkbox para ativar/desativar monitoramento e visibilidade no gráfico
- `App.vue` — cards de status organizados em carrossel com largura dinâmica e navegação por setas; novo botão de engrenagem no header abre o painel de configuração

### Alterado

#### Frontend
- `SpeedChart.vue` — gráfico unificado exibindo download, upload e ping simultaneamente, com cores e eixos gerados dinamicamente para N WANs (prop única `wans`, substitui as props fixas `wan1Tests`/`wan2Tests`); download em linha sólida, upload tracejada, ping pontilhada; eixo Y duplo (Mbps à esquerda, ms à direita); legenda simplificada mostrando só a métrica
- `WanForm.vue` — grid de limites/cor em 12 colunas, proporção 3/3/3/2/1 entre Min. Download, Min. Upload, Max. Ping, Ordem e Cor
- Timestamps corrigidos para horário local (`datetime('now', 'localtime')` no SQLite; parse ajustado no frontend) — evita o offset de +3h causado por armazenamento em UTC

#### Configuração
- `.env.example` / `.env` — removidas `WAN1_*`, `WAN2_*`, `CRON_INTERVAL`; WANs e intervalo de coleta agora são configurados pela UI (ícone ⚙️), persistidos no banco
- `docker-compose.yml` / `.env` — adicionada variável `TZ=America/Sao_Paulo`

### Notas
- Não há mais limite fixo de 2 WANs — quantas forem cadastradas são testadas a cada ciclo
- Remover uma WAN com histórico faz soft delete (some da UI, testes antigos preservados); sem histórico, remove definitivamente

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
