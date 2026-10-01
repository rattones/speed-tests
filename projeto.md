# Contexto do Projeto

**Speed Monitor** — aplicação completa rodando em Docker para monitorar a rede, em duas modalidades:

- **WANs** — velocidade dos links de internet conectados a um load balancer **TP-Link Omada ER605**. Cada link é isolado via **Policy Routing** (Roteamento de Política) / rota estática no roteador, que direciona o tráfego para o IP do servidor de teste da Ookla configurado para aquela WAN. Por isso, cada WAN testa sempre um servidor fixo.
- **Rede Local** — velocidade e latência entre cada computador da rede e o próprio servidor, por toda a rota (WiFi ou cabo). Um agente instalado em cada máquina mede e envia os resultados; no dashboard, cada máquina se comporta como uma WAN (card de status + linha no gráfico).

Versão atual: ver `manifest.json` (formato `x.y.z` — x: funcionalidades principais, y: melhorias, z: correções e pequenos ajustes).

# Stack Tecnológica
- Base: container Docker único (`node:20-slim` + `speedtest-cli` oficial da Ookla).
- Engine de teste WAN: script Bash invocando o `speedtest-cli` oficial da Ookla (formato JSON).
- Engine de teste LAN: endpoints HTTP no próprio backend + agentes sem dependências (Bash para Linux/macOS, PowerShell para Windows).
- Backend: Node.js 20 + Express, agendamento com `node-cron`, API REST.
- Banco de dados: SQLite3 (`better-sqlite3`, WAL mode), armazenado localmente.
- Frontend: Vue 3 via CDN (SFCs carregados em runtime por `vue3-sfc-loader`, sem build step) + Tailwind CSS (CDN) + ApexCharts.

# Requisitos Arquiteturais e de Segurança
1. Credenciais e infraestrutura: apenas configurações de infraestrutura ficam no `.env` (`PORT`, `TZ`, `DB_PATH`, `LAN_TEST_MAX_BYTES`), com `.env.example` sempre espelhando o `.env`. O `.env` e o banco SQLite (`data/`, `*.db`) ficam no `.gitignore` e nunca são comitados.
2. Configuração funcional (WANs, dispositivos, limites, cores, intervalo de coleta) é feita pela UI e persistida no banco — não por variáveis de ambiente.
3. Docker: `Dockerfile` e `docker-compose.yml`.
   - Painel exposto na porta 8020 (`8020:8020`).
   - Volumes: código-fonte do backend e do frontend (desenvolvimento), `node_modules` isolado em volume nomeado, banco SQLite (`./data`), `.env` (somente leitura) e `manifest.json` (somente leitura).
   - `TZ=America/Sao_Paulo`; timestamps gravados em horário local.
4. Entradas HTTP validadas e consultas sempre com prepared statements.
5. Endpoints de teste de rede local com volume limitado por `LAN_TEST_MAX_BYTES` (padrão 100 MB).

# Especificações dos Componentes

## 1. Agendador e Medição de WAN (Bash + Node.js)
- O Node.js gerencia um cron job cujo intervalo é configurado pela UI (tabela `app_settings`, chave `cron_interval`; padrão `*/15 * * * *`).
- A cada disparo, o agendador lê a lista de WANs ativas do banco e executa uma medição sequencial por WAN com `speedtest --accept-license --accept-gdpr --format=json --server-id=<ID>` (`scripts/run_speedtest.sh`). Não há limite fixo de WANs.
- Download/upload são convertidos de bytes/s para Mbps (`bandwidth * 8 / 1_000_000`) e gravados em `speed_tests` junto com ping e timestamp local.
- Mudanças de WAN ou de intervalo recarregam o agendador em runtime (`reloadScheduler()`), sem restart.
- Teste manual sob demanda por WAN (`POST /api/tests/run`).
- Migração automática e idempotente: deployments antigos com `WAN1_*`/`WAN2_*`/`CRON_INTERVAL` no `.env` são migrados para o banco na primeira subida.

## 2. Monitoramento de Rede Local (agentes + endpoints HTTP)
- O servidor é o alvo do teste: `GET /api/lan/ping` (RTT), `GET /api/lan/download?bytes=N` (stream de bytes aleatórios) e `POST /api/lan/upload` (consome e cronometra).
- A matemática de medição (ping, jitter, download, upload → Mbps) tem referência única em `lanMeasure.js`, com versão para o navegador.
- Identidade da máquina: MAC address normalizado da interface ativa. A máquina se cadastra sozinha no primeiro resultado; envios posteriores só atualizam metadados (hostname, SO, tipo de conexão, `last_seen_at`), nunca nome ou cor.
- **Agente Linux/macOS** (`lan-monitor.sh`, só `curl` + coreutils):
  - detecta MAC e tipo de conexão da interface default; no fallback, exige link ativo e ignora interfaces virtuais (docker0, veth, br-*);
  - flags `--server`, `--once`, `--name`, `--interval`;
  - `--install` cria auto-início (`systemd --user` com `Restart=always` + lingering no Linux; `LaunchAgent` com `KeepAlive` no macOS); `--uninstall` remove tudo;
  - locale forçado a `C`; log de payloads em `~/.local/share/lan-monitor/payloads.log` com rotação em ~10 KB.
- **Agente Windows** (`lan-monitor.ps1`, PowerShell 5.1+, sem dependências):
  - `Get-NetAdapter` para MAC/tipo (só adaptador físico com status `Up`), `System.Net.WebRequest` para os testes, `InvariantCulture` no JSON;
  - `-Install` registra Tarefa Agendada (`SpeedMonitor-LanMonitor`, gatilho "Ao fazer logon", reinício automático) que roda totalmente oculta, via `wscript.exe` + lançador `.vbs`, sem janela de console; `-Hidden` roda o loop manual do mesmo modo; `-Uninstall` remove;
  - log de payloads em `%LOCALAPPDATA%\SpeedMonitor\payloads.log` com rotação em ~10 KB.
- Sem `--interval`/`-Interval`, o agente usa o mesmo intervalo de coleta das WANs, obtido de `GET /api/config` (fallback de 300s). O valor resolvido é gravado fixo no serviço/tarefa ao instalar.
- Os agentes são baixados do próprio servidor (`GET /api/lan/agent/:os`).

## 3. Banco de Dados (SQLite3)
- `speed_tests` — `id`, `interface_name` (nome da WAN no momento da medição), `wan_id` (FK estável para `wans`), `download_mbps`, `upload_mbps`, `ping_ms`, `created_at`.
- `wans` — `id`, `name`, `server_id` (Ookla), `color_hex`, `min_download`, `min_upload`, `max_ping`, `sort_order`, `active` (soft delete), `created_at`, `updated_at`.
- `app_settings` — chave-valor (`cron_interval`).
- `devices` — `id`, `machine_id` (MAC, único), `name`, `hostname`, `os`, `conn_type`, `color_hex`, `min_download`, `min_upload`, `max_ping`, `sort_order`, `active`, `last_seen_at`.
- `lan_tests` — `id`, `device_id`, `device_name` (snapshot), `download_mbps`, `upload_mbps`, `ping_ms`, `jitter_ms`, `created_at`.
- Regras de remoção:
  - WAN com histórico → soft delete (some da UI, histórico preservado); sem histórico ou com `?force=1` → remoção definitiva.
  - Dispositivo de rede local → "Remover" apaga o dispositivo e todo o seu histórico em definitivo; "Desativar" pausa sem perder o histórico.

## 4. API Backend (Node.js)
### WANs e configuração
- `GET /api/tests` — histórico (`?days=N`, padrão 1, máx. 90; ou `?from&to`; filtro `?wan=<id>`).
- `POST /api/tests/run` — teste manual (`{ wanId }`); 400 para WAN inválida, 503 sem Server ID.
- `GET /api/config` / `PUT /api/config` — intervalo de coleta (cron).
- `GET/POST/PUT/DELETE /api/config/wans` — CRUD de WANs (`?all=1` inclui removidas; `?force=1` força remoção definitiva).
- `GET /api/config/wans/lookup-ip?serverId=N` — roda um teste real para descobrir o IP do servidor Ookla (usado para a rota estática).

### Rede local
- `GET /api/lan/ping`, `GET /api/lan/download`, `POST /api/lan/upload` — engine de teste HTTP.
- `POST /api/lan/results` — ingestão do agente (`{ machineId, hostname, os, connType, download, upload, ping, jitter, name? }`); responde 400 com detalhe quando o JSON é inválido e aceita vírgula decimal.
- `GET /api/lan/tests` — histórico (mesma assinatura de `/api/tests`, filtro `?device=<id>`).
- `GET/POST/PUT/DELETE /api/lan/devices` — CRUD de dispositivos.
- `GET /api/lan/agent/:os` — download do agente (`linux`, `macos`, `windows`).

### Versão
- `GET /api/version` — `{ current, latest, updateAvailable }`: versão local (`manifest.json`, fallback `backend/package.json`) comparada com o `manifest.json` do branch `master` no GitHub (cache de 1h, timeout de 5s; se o GitHub não responder, não há aviso).

## 5. Frontend & Dashboard (Vue.js)
SPA limpa, sem scroll vertical na página, com tamanhos responsivos à altura da tela.

- **Header**: seletor de abas **WANs** | **Rede Local** e botão ⚙️ de configurações.
- **Cards de status** (`WanCard.vue`, reutilizado para WANs e dispositivos):
  - último resultado de download, upload e ping, e há quanto tempo foi medido;
  - indicador verde/vermelho conforme os mínimos de download e upload;
  - cor de download/upload em três níveis em relação ao mínimo: vermelho (abaixo do mínimo), amarelo (até 20% acima), verde (mais de 20% acima); sem mínimo configurado, branco;
  - cor do ping em três níveis em relação ao máximo (menor é melhor): vermelho (acima do máximo), amarelo (até 20% abaixo), verde (mais de 20% abaixo); sem máximo configurado, cinza claro;
  - badge com a ordem de exibição, checkbox de visibilidade no gráfico e botão "Medir agora" (WANs), com spinner durante o teste;
  - em dispositivos: subtítulo com tipo de conexão · SO · visto há…;
  - organizados em carrossel com largura dinâmica e navegação por setas.
- **Gráfico de histórico** (`SpeedChart.vue`, ApexCharts):
  - download (linha sólida), upload (tracejada) e ping (pontilhada) de N WANs/dispositivos ao mesmo tempo;
  - cores derivadas da cor de acento de cada WAN (upload e ping em tons mais claros);
  - eixo Y fixo de 0 a 800 (Mbps / ms);
  - tooltip que agrupa, por WAN, o ponto mais próximo do cursor;
  - janela de 24h com navegação por setas e busca por período (datas de/até).
- **Aba Rede Local** (`LanTab.vue`):
  - mesmos cards e gráfico da aba WANs, por dispositivo;
  - "Testar deste computador" — teste efêmero pelo navegador, exibido em modal com progresso por fase (não salva nem cria dispositivo);
  - "Monitorar um computador" — modal com passo a passo por SO: download do agente, comandos prontos apontando para este servidor, instalação como auto-início, remoção e caminho do log de diagnóstico.
- **Configurações** (modal ⚙️, mostra só a lista da aba ativa):
  - WANs: adicionar/editar/remover, ativar/desativar (nome, Server ID, cor, limites de download/upload/ping, ordem), com prévia dos tons derivados;
  - ao adicionar ou alterar o Server ID, um modal descobre o IP do servidor e orienta a criar a rota estática no load balancer;
  - intervalo de coleta (cron) com explicação do formato;
  - dispositivos da rede local: editar (nome, cor, ordem, limites), desativar ou remover.
- **Rodapé**:
  - intervalo de coleta atual, autor e link do repositório;
  - versão instalada; quando há versão mais recente no GitHub, fica em vermelho com o link "atualização disponível (vX.Y.Z)".

## 6. Limites de Alerta
- Cada WAN e cada dispositivo tem limites de download mínimo, upload mínimo e ping máximo, configurados pela UI.
- Limite `0` desativa a checagem daquela métrica.
- Download e upload mínimos e ping máximo definem as cores dos valores nos cards; o indicador verde/vermelho do card considera só download e upload.
- Os alertas são visuais no dashboard (indicador e cores dos cards). As Web Push Notifications previstas originalmente foram removidas do projeto.
