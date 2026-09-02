# Speed Monitor

Monitor de rede com dashboard em tempo real e histórico de medições, em duas modalidades:

- **WANs** — velocidade dos links de internet (via `speedtest-cli` da Ookla, isolados por Policy Routing no roteador).
- **Rede Local** — velocidade e latência entre cada computador da rede e este servidor, por toda a rota (WiFi ou cabo), coletadas por um agente que roda na máquina (máquina = WAN no dashboard).

Desenvolvido para uso com roteador **TP-Link Omada ER605** em configuração de load balancer. O isolamento de cada link é feito via **Policy Routing** (Roteamento de Política) no roteador, direcionando o tráfego aos servidores de teste configurados.

## Stack

| Camada | Tecnologia |
|---|---|
| Container | Docker (imagem única) |
| Backend | Node.js 20 + Express |
| Agendador | node-cron |
| Banco de dados | SQLite3 (better-sqlite3) |
| Engine de teste WAN | speedtest-cli oficial Ookla |
| Engine de teste LAN | endpoints HTTP no próprio backend + agente (bash / PowerShell) |
| Frontend | Vue 3 (CDN) + Tailwind CSS + ApexCharts |

## Estrutura do Projeto

```
speed-tests/
├── Dockerfile
├── docker-compose.yml
├── .env.example
├── .gitignore
├── data/                        ← banco SQLite (criado manualmente, ver setup)
├── backend/
│   ├── server.js                ← entry point Express
│   ├── db.js                    ← inicialização SQLite + schema
│   ├── scheduler.js             ← cron + execução dos testes de WAN
│   ├── configService.js         ← CRUD de WANs + intervalo de coleta
│   ├── deviceService.js         ← CRUD de dispositivos + auto-registro (LAN)
│   ├── lanMeasure.js            ← referência da matemática de medição LAN
│   ├── package.json
│   ├── routes/
│   │   ├── tests.js             ← /api/tests (histórico + teste manual de WAN)
│   │   ├── config.js            ← /api/config, /api/config/wans
│   │   └── lan.js               ← /api/lan/* (teste HTTP, results, devices, agente)
│   └── scripts/
│       ├── run_speedtest.sh     ← wrapper do speedtest-cli
│       ├── lan-monitor.sh       ← agente de rede local (Linux/macOS)
│       └── lan-monitor.ps1      ← agente de rede local (Windows)
└── frontend/
    ├── index.html
    └── src/
        ├── main.js
        ├── App.vue              ← header + seletor de abas
        ├── lanMeasure.js        ← medição LAN pelo navegador
        ├── utils/
        │   └── color.js         ← derivação de tons a partir da cor de acento
        └── components/
            ├── WanTab.vue       ← aba WANs (cards + gráfico)
            ├── LanTab.vue       ← aba Rede Local (cards + gráfico + teste no navegador)
            ├── WanCard.vue      ← card de status (WAN ou dispositivo)
            ├── SpeedChart.vue   ← gráfico ApexCharts
            ├── ConfigPanel.vue  ← configurações (WANs, cron, dispositivos)
            ├── WanForm.vue      ← form de WAN
            ├── DeviceForm.vue   ← form de dispositivo
            ├── ServerIpModal.vue← rota estática ao mudar Server ID de WAN
            └── LanHelpModal.vue ← instruções para instalar o agente
```

## Pré-requisitos

- Docker e Docker Compose instalados na máquina host
- Acesso à internet para instalar o speedtest-cli no build e para os testes de WAN
- Para o monitoramento de rede local: a porta `8020` acessível na LAN a partir dos computadores monitorados

## Setup

### 1. Clonar e preparar

```bash
git clone <repo-url> speed-tests
cd speed-tests
mkdir -p data
cp .env.example .env
```


### 2. Descobrir IDs dos servidores Ookla

```bash
# Após o primeiro build:
docker compose build
docker exec speed-tests speedtest --accept-license --accept-gdpr --servers
```

Anote os IDs dos servidores que deseja usar para cada WAN — eles são cadastrados pela tela de Configurações da aplicação (passo 5), não pelo `.env`.

### 3. Configurar o `.env`

Apenas configurações de infraestrutura ficam no `.env`:

```env
PORT=8020
TZ=America/Sao_Paulo
DB_PATH=/data/speed_tests.db
```

WANs (servidor Ookla, nome, limites de alerta, cor) e o intervalo de coleta (cron) são configurados pela própria interface web, persistidos no banco SQLite — ver "Configurar WANs" abaixo.

### 4. Configurar Policy Routing no ER605

No painel do Omada Controller, configure regras de **Policy Routing** para direcionar o tráfego ao IP de cada servidor de teste pela WAN correspondente. Para descobrir os IPs:

```bash
docker exec speed-tests speedtest --accept-license --accept-gdpr --format=json --server-id=<ID> \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(r['server']['ip'])"
```

### 5. Iniciar

```bash
docker compose up -d
```

Acesse o dashboard em: **http://\<ip-do-host\>:8020**

### 6. Configurar WANs

No primeiro acesso, se você já tinha um `.env` de uma versão anterior com `WAN1_*`/`WAN2_*`/`CRON_INTERVAL`, esses valores são migrados automaticamente para o banco. Caso contrário, clique no ícone **⚙️** no canto superior direito do dashboard para:

- Adicionar, editar ou remover WANs (nome, ID do servidor Ookla, cor, limites de alerta de download/upload/ping, ordem de exibição)
- Ajustar o intervalo de coleta (cron) — o formulário explica o formato (`minuto hora dia-do-mês mês dia-da-semana`)

A ordem de exibição (campo "Ordem") define a posição do card de cada WAN no carrossel do dashboard; o número correspondente é exibido como um badge no header do card.

Não há limite fixo de WANs — quantas forem cadastradas serão testadas a cada ciclo.

### 7. Monitorar a rede local

Na aba **Rede Local** do dashboard:

- **Testar deste computador** — roda uma medição na hora, direto pelo navegador. O resultado é só exibido, **não é salvo** nem cria dispositivo.
- **Monitorar um computador** — abre as instruções para instalar o agente numa máquina. O agente:
  - identifica a máquina pelo **MAC address** da interface de rede ativa (a máquina se cadastra sozinha na primeira medição);
  - mede download/upload/ping/jitter contra este servidor e envia o resultado periodicamente;
  - cada máquina vira um card + uma linha no gráfico, igual a uma WAN.

Baixe o agente pela própria tela ou diretamente:

```bash
# Linux / macOS
curl -fsSL http://<ip-do-host>:8020/api/lan/agent/linux -o lan-monitor.sh
chmod +x lan-monitor.sh
./lan-monitor.sh --server http://<ip-do-host>:8020 --once --name "Notebook Sala"   # medição de teste

# instalar como serviço de auto-início (volta sozinho após reboot):
./lan-monitor.sh --server http://<ip-do-host>:8020 --interval 300 --name "Notebook Sala" --install
# parar e remover:
./lan-monitor.sh --uninstall

# Windows (PowerShell)
Invoke-WebRequest http://<ip-do-host>:8020/api/lan/agent/windows -OutFile lan-monitor.ps1
powershell -ExecutionPolicy Bypass -File .\lan-monitor.ps1 -Server http://<ip-do-host>:8020 -Once -Name "PC Sala"
powershell -ExecutionPolicy Bypass -File .\lan-monitor.ps1 -Server http://<ip-do-host>:8020 -Interval 300 -Name "PC Sala" -Install
powershell -ExecutionPolicy Bypass -File .\lan-monitor.ps1 -Uninstall
```

Os scripts só usam ferramentas nativas do sistema (`curl`/coreutils no Linux/macOS, cmdlets padrão no Windows) — sem dependências.

- `--install` / `-Install` configura o auto-início: **serviço `systemd --user`** (Linux, com `Restart=always`; rode `sudo loginctl enable-linger $USER` uma vez para rodar sem sessão aberta), **LaunchAgent** (macOS) ou **Tarefa Agendada** com gatilho "Ao fazer logon" (Windows). Não é preciso recriar nada a cada reboot.
- `--uninstall` / `-Uninstall` para o serviço e remove a unidade/tarefa e a cópia do script.

Depois de remover na máquina, tire o card no dashboard pelo ícone **⚙️** → "Dispositivos da rede local" → **Remover** (histórico preservado; "Remover" de novo apaga em definitivo) ou **Desativar** (pausa sem perder o histórico). Nome, cor, ordem e limites de alerta de cada dispositivo também são ajustados aí.

Cada payload enviado (e a resposta do servidor) é registrado num log de diagnóstico com rotação em ~10 KB:

| SO | Caminho |
|---|---|
| Linux / macOS | `~/.local/share/lan-monitor/payloads.log` (sobrescrevível com `LOG_FILE=`) |
| Windows | `%LOCALAPPDATA%\SpeedMonitor\payloads.log` |

> A porta `8020` precisa estar acessível na rede local a partir dos computadores monitorados.

## Uso

### Iniciar / parar

```bash
docker compose up -d        # iniciar em background
docker compose down         # parar e remover container
docker compose restart      # reiniciar (sem recriar — não recarrega .env)
docker compose down && docker compose up -d   # recarregar .env alterado
```

### Acompanhar logs

```bash
docker compose logs -f
```

### Forçar um teste manual

```bash
docker exec speed-tests bash /app/scripts/run_speedtest.sh <SERVER_ID>
```

### Inserir dados de teste no banco (debug)

```bash
docker exec -it speed-tests sh -c "
  sqlite3 /data/speed_tests.db \"
    INSERT INTO speed_tests (interface_name, download_mbps, upload_mbps, ping_ms) VALUES
    ('Algar', 310.5, 105.2, 8.4),
    ('MGNet', 295.1, 98.7, 12.9);
  \"
"
```

## API REST

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/tests?days=7` | Histórico de testes (padrão: últimos 7 dias, máx. 90) |
| GET | `/api/tests?wan=<wanId>` | Filtrado por WAN (id numérico) |
| POST | `/api/tests/run` | Dispara teste manual (`{ "wanId": <id> }`) |
| GET | `/api/config` | Intervalo de coleta (cron) atual |
| PUT | `/api/config` | Atualiza o intervalo de coleta |
| GET | `/api/config/wans` | Lista WANs cadastradas (`?all=1` inclui removidas) |
| POST | `/api/config/wans` | Cria uma WAN |
| PUT | `/api/config/wans/:id` | Atualiza uma WAN |
| DELETE | `/api/config/wans/:id` | Remove uma WAN (soft delete se houver histórico; `?force=1` força remoção definitiva) |

### Rede Local

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/lan/ping` | Resposta vazia (204) — usada para medir RTT |
| GET | `/api/lan/download?bytes=N` | Envia N bytes aleatórios (cap `LAN_TEST_MAX_BYTES`) |
| POST | `/api/lan/upload` | Consome e cronometra o corpo; retorna `{ bytes, ms }` |
| POST | `/api/lan/results` | Ingestão do agente: `{ machineId, hostname, os, connType, download, upload, ping, jitter, name? }` |
| GET | `/api/lan/tests?days=7` | Histórico de medições LAN (`?from&to`, `?device=<id>` — mesma assinatura de `/api/tests`) |
| GET | `/api/lan/devices` | Lista dispositivos (`?all=1` inclui removidos) |
| POST | `/api/lan/devices` | Cria um dispositivo manualmente |
| PUT | `/api/lan/devices/:id` | Atualiza nome/cor/ordem/limites/ativo |
| DELETE | `/api/lan/devices/:id` | Remove (soft delete se houver histórico; `?force=1` força) |
| GET | `/api/lan/agent/:os` | Baixa o agente (`linux`, `macos` ou `windows`) |

## Banco de Dados

Arquivo SQLite em `./data/speed_tests.db`. Tabelas:

**`speed_tests`**
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | PK auto-increment |
| `interface_name` | TEXT | Nome da WAN no momento da medição (snapshot histórico) |
| `wan_id` | INTEGER | FK para `wans.id` (vínculo estável) |
| `download_mbps` | REAL | Velocidade de download em Mbps |
| `upload_mbps` | REAL | Velocidade de upload em Mbps |
| `ping_ms` | REAL | Latência em ms |
| `created_at` | DATETIME | Timestamp da medição |

**`wans`**
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | PK auto-increment |
| `name` | TEXT | Nome de exibição |
| `server_id` | TEXT | ID do servidor Ookla |
| `color_hex` | TEXT | Cor de acento (`#RRGGBB`) — usada como cor de download; upload/ping derivam tons automaticamente |
| `min_download` / `min_upload` / `max_ping` | REAL | Limites de alerta |
| `sort_order` | INTEGER | Posição de exibição do card no carrossel do dashboard |
| `active` | INTEGER | 0 = removida (soft delete, histórico preservado) |

**`app_settings`**
| Campo | Tipo | Descrição |
|---|---|---|
| `key` | TEXT | Chave (ex.: `cron_interval`) |
| `value` | TEXT | Valor |

**`devices`** (rede local)
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | PK auto-increment |
| `machine_id` | TEXT | MAC normalizado (`aabbccddeeff`), único — identifica a máquina |
| `name` | TEXT | Nome de exibição (padrão = hostname; editável) |
| `hostname` / `os` / `conn_type` | TEXT | Metadados enviados pelo agente (`wifi`/`ethernet`, `linux`/`windows`/`macos`) |
| `color_hex` | TEXT | Cor de acento (`#RRGGBB`) |
| `min_download` / `min_upload` / `max_ping` | REAL | Limites de alerta |
| `sort_order` | INTEGER | Posição do card no dashboard |
| `active` | INTEGER | 0 = removido (soft delete, histórico preservado) |
| `last_seen_at` | DATETIME | Último check-in do agente |

**`lan_tests`** (rede local)
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | PK auto-increment |
| `device_id` | INTEGER | FK para `devices.id` |
| `device_name` | TEXT | Nome do dispositivo no momento da medição (snapshot) |
| `download_mbps` / `upload_mbps` / `ping_ms` / `jitter_ms` | REAL | Métricas medidas |
| `created_at` | DATETIME | Timestamp da medição |

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `8020` | Porta do servidor HTTP |
| `TZ` | — | Timezone do container |
| `DB_PATH` | `/data/speed_tests.db` | Caminho do banco SQLite no container |
| `LAN_TEST_MAX_BYTES` | `104857600` | Tamanho máx. (bytes) dos endpoints de teste de rede local |

WANs e intervalo de coleta não são mais configurados por variável de ambiente — ver "Configurar WANs" acima.

## Limites de alerta

Cada WAN e cada dispositivo tem limites configuráveis de **download mínimo**, **upload mínimo** e **ping máximo** (⚙️ na UI). Quando uma medição fica abaixo do esperado, o card fica com o indicador vermelho e o valor destacado; limite `0` desativa a checagem daquela métrica.

## Segurança

- Credenciais ficam exclusivamente no `.env`, que está no `.gitignore`
- O banco SQLite (`./data/`) também está no `.gitignore`
- Todos os inputs recebidos via HTTP são validados com prepared statements (proteção contra SQL injection)
- O arquivo `.env` é montado no container como somente leitura (`:ro`)
- Os endpoints de teste de rede local (`/api/lan/download`, `/api/lan/upload`) têm o volume limitado por `LAN_TEST_MAX_BYTES`
