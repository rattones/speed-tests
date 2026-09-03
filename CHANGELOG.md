# Changelog

Todas as alterações relevantes deste projeto serão documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/).

---

## [Não lançado]

### Alterado
- `scripts/lan-monitor.sh` e `scripts/lan-monitor.ps1` — quando `--interval`/`-Interval` não é informado, o intervalo entre medições é obtido automaticamente do servidor (`GET /api/config`, campo `cronInterval`, o mesmo intervalo de coleta configurado para as WANs) em vez do fixo de 300s; se o servidor não responder ou a expressão cron não for reconhecida, mantém o fallback de 300s. O valor resolvido é gravado fixo no serviço/tarefa ao instalar (`--install`/`-Install`)

### Adicionado

#### Monitoramento de rede local (máquina = WAN)

Nova modalidade que mede a velocidade e a latência entre cada computador da rede
e este servidor, por toda a rota (WiFi ou cabo). Cada máquina se comporta como
uma WAN: card de status + linha no gráfico de histórico, numa aba separada.
O próprio servidor é o alvo do teste (endpoints HTTP), não a Ookla.

##### Backend
- `db.js` — tabelas `devices` (MAC normalizado como `machine_id` único, nome/cor/ordem/limites editáveis, soft delete, `last_seen_at`) e `lan_tests` (histórico por dispositivo, com `jitter_ms`); espelham o par `wans`/`speed_tests`
- `deviceService.js` (novo) — CRUD de dispositivos e `upsertDevice()` (auto-registro no primeiro resultado; check-ins posteriores só atualizam metadados de sistema, nunca nome/cor); paleta de cores rotativa para novos dispositivos
- `routes/lan.js` (novo), montado em `/api/lan` **antes** do `express.json()` global:
  - `GET /api/lan/ping` (204), `GET /api/lan/download?bytes=N` (stream de bytes aleatórios, cap `LAN_TEST_MAX_BYTES`), `POST /api/lan/upload` (consome e cronometra) — engine de teste HTTP
  - `POST /api/lan/results` — ingestão do agente (`{ machineId, hostname, os, connType, download, upload, ping, jitter, name? }`); responde `400` com detalhe e loga o corpo cru quando o JSON é inválido; `num()` aceita vírgula decimal
  - `GET /api/lan/tests` — histórico (mesma assinatura de `/api/tests`: `?days`, `?from&to`, `?device`)
  - `GET/POST/PUT/DELETE /api/lan/devices` — CRUD (DTO camelCase, soft/hard delete como as WANs)
  - `GET /api/lan/agent/:os` — baixa `lan-monitor.sh` (linux/macos) ou `lan-monitor.ps1` (windows)
- `lanMeasure.js` (novo) — referência única da matemática de medição (ping/download/upload → Mbps/jitter)
- `scripts/lan-monitor.sh` (novo) — agente Linux/macOS, só `curl` + coreutils: detecta MAC e tipo de conexão da interface default, loop com `--interval`, flags `--server`/`--once`/`--name`. `--install` cria e ativa auto-início (serviço `systemd --user` com `Restart=always` + lingering no Linux; `LaunchAgent` com `KeepAlive` no macOS); `--uninstall` remove tudo. Locale forçado a `C` (separador decimal ponto); log de payloads em `~/.local/share/lan-monitor/payloads.log` (rotação em ~10 KB, sobrescrevível via `LOG_FILE=`)
- `scripts/lan-monitor.ps1` (novo) — agente Windows (PowerShell 5.1+), sem dependências: `Get-NetAdapter` para MAC/tipo, `System.Net.WebRequest` para os testes (nativo do .NET Framework — evita o `HttpClient` indisponível no PS 5.1), `InvariantCulture` no `ConvertTo-Json`. `-Install` registra Tarefa Agendada (`SpeedMonitor-LanMonitor`, gatilho "Ao fazer logon", janela oculta, reinício automático); `-Uninstall` remove. Log de payloads em `%LOCALAPPDATA%\SpeedMonitor\payloads.log` (rotação em ~10 KB)

##### Frontend
- `App.vue` — seletor de abas no header (**WANs** | **Rede Local**); conteúdo das WANs extraído para `WanTab.vue`, sem mudança de comportamento
- `WanTab.vue` (novo) — corpo do dashboard de WANs (cards + gráfico + janela de 24h + busca por data), antes embutido no `App.vue`
- `LanTab.vue` (novo) — espelha o `WanTab`, reusando `WanCard.vue` e `SpeedChart.vue` sem alteração; botão **"Testar deste computador"** roda um teste efêmero pelo navegador (só exibição, não persiste); botão **"Monitorar um computador"** abre as instruções
- `LanHelpModal.vue` (novo) — passo a passo por SO (Linux/macOS/Windows) com link de download do agente e comandos prontos apontando para a origem deste servidor: medição de teste, instalação como auto-início (`--install`), remoção (`--uninstall` + "Remover"/"Desativar" no dashboard) e caixa de diagnóstico com o caminho do log de payloads
- `DeviceForm.vue` (novo) — formulário de edição de dispositivo (cópia enxuta do `WanForm.vue`, sem Server ID)
- `ConfigPanel.vue` — nova seção "Dispositivos da rede local" (ativar/desativar/editar/remover), espelhando "WANs monitoradas"; deixou de receber a prop `wans` do `App.vue` (já buscava por conta própria)
- `WanCard.vue` — props opcionais `canRunTest` (oculta "Medir agora") e `subtitle` (tipo de conexão · SO · visto há…); comportamento das WANs inalterado
- `lanMeasure.js` (novo) — versão browser da medição, exposta em `window.__LAN_MEASURE__`

##### Configuração
- `.env` / `.env.example` — nova variável `LAN_TEST_MAX_BYTES` (padrão 100 MB), cap dos endpoints de teste de rede local
- `Dockerfile` / `docker-compose.yml` — sem alteração (scripts ficam em `backend/scripts/`, já copiada/montada)

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
