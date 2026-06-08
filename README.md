# Speed Monitor

Monitor de velocidade de internet para dois links WAN, com dashboard em tempo real, histórico de medições e alertas via Web Push Notifications.

Desenvolvido para uso com roteador **TP-Link Omada ER605** em configuração de load balancer. O isolamento de cada link é feito via **Policy Routing** (Roteamento de Política) no roteador, direcionando o tráfego aos servidores de teste configurados.

## Stack

| Camada | Tecnologia |
|---|---|
| Container | Docker (imagem única) |
| Backend | Node.js 20 + Express |
| Agendador | node-cron |
| Banco de dados | SQLite3 (better-sqlite3) |
| Engine de teste | speedtest-cli oficial Ookla |
| Frontend | Vue 3 (CDN) + Tailwind CSS + ApexCharts |
| Alertas | Web Push Notifications (VAPID) |

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
│   ├── db.js                    ← inicialização SQLite
│   ├── scheduler.js             ← cron + execução dos testes
│   ├── push.js                  ← envio de Web Push (VAPID)
│   ├── package.json
│   ├── routes/
│   │   ├── tests.js             ← GET /api/tests
│   │   ├── config.js            ← GET /api/config
│   │   └── push.js              ← POST /api/push/register
│   └── scripts/
│       └── run_speedtest.sh     ← wrapper do speedtest-cli
└── frontend/
    ├── index.html
    ├── sw.js                    ← Service Worker (push)
    └── src/
        ├── main.js
        ├── App.vue
        └── components/
            ├── WanCard.vue      ← card de status por WAN
            ├── SpeedChart.vue   ← gráfico ApexCharts
            └── AlertButton.vue  ← ativar push notifications
```

## Pré-requisitos

- Docker e Docker Compose instalados na máquina host
- Acesso à internet para instalar o speedtest-cli no build e para os testes
- Dois links WAN conectados ao roteador TP-Link Omada ER605

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

Anote os IDs dos servidores que deseja usar para cada WAN.

### 3. Configurar o `.env`

```env
PORT=8020
CRON_INTERVAL="*/15 * * * *"

WAN1_SERVER_ID=48008        # ID do servidor para a WAN 1
WAN2_SERVER_ID=18341        # ID do servidor para a WAN 2
WAN1_NAME=Algar             # Nome de exibição da WAN 1
WAN2_NAME=MGNet             # Nome de exibição da WAN 2

WAN1_MIN_DOWNLOAD=300       # Limite mínimo de download (Mbps)
WAN1_MIN_UPLOAD=100
WAN2_MIN_DOWNLOAD=300
WAN2_MIN_UPLOAD=100


DB_PATH=/data/speed_tests.db
```

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
| GET | `/api/tests?wan=Algar` | Filtrado por interface |
| GET | `/api/config` | Configurações públicas (limites, nomes, chave VAPID pública) |
| POST | `/api/push/register` | Registra subscription de push notification |

## Banco de Dados

Arquivo SQLite em `./data/speed_tests.db`. Tabelas:

**`speed_tests`**
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | PK auto-increment |
| `interface_name` | TEXT | Nome da WAN |
| `download_mbps` | REAL | Velocidade de download em Mbps |
| `upload_mbps` | REAL | Velocidade de upload em Mbps |
| `ping_ms` | REAL | Latência em ms |
| `created_at` | DATETIME | Timestamp da medição |

**`push_subscriptions`**
| Campo | Tipo | Descrição |
|---|---|---|
| `id` | INTEGER | PK auto-increment |
| `endpoint` | TEXT | URL de push (único) |
| `subscription_json` | TEXT | Objeto de subscription serializado |
| `created_at` | DATETIME | Data de registro |

## Variáveis de Ambiente

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `8020` | Porta do servidor HTTP |
| `CRON_INTERVAL` | `"*/15 * * * *"` | Intervalo dos testes (formato cron, **com aspas**) |
| `WAN1_SERVER_ID` | — | ID do servidor Ookla para a WAN 1 (obrigatório) |
| `WAN2_SERVER_ID` | — | ID do servidor Ookla para a WAN 2 (obrigatório) |
| `WAN1_NAME` | `WAN_1` | Nome de exibição da WAN 1 |
| `WAN2_NAME` | `WAN_2` | Nome de exibição da WAN 2 |
| `WAN1_MIN_DOWNLOAD` | `0` | Limite mínimo de download da WAN 1 (Mbps) |
| `WAN1_MIN_UPLOAD` | `0` | Limite mínimo de upload da WAN 1 (Mbps) |
| `WAN2_MIN_DOWNLOAD` | `0` | Limite mínimo de download da WAN 2 (Mbps) |
| `WAN2_MIN_UPLOAD` | `0` | Limite mínimo de upload da WAN 2 (Mbps) |
| `DB_PATH` | `/data/speed_tests.db` | Caminho do banco SQLite no container |

## Alertas Push

1. No dashboard, clique em **"Ativar Alertas"**
2. A subscription é registrada via `POST /api/push/register`
3. Sempre que um teste registrar velocidade abaixo dos limites definidos no `.env`, uma notificação é enviada para todos os browsers registrados
4. Subscriptions expiradas (HTTP 410/404) são removidas automaticamente do banco

> As chaves VAPID são necessárias para push notifications. Se não estiverem configuradas, o sistema funciona normalmente — apenas sem alertas.

## Segurança

- Credenciais ficam exclusivamente no `.env`, que está no `.gitignore`
- O banco SQLite (`./data/`) também está no `.gitignore`
- A chave privada VAPID nunca é exposta pela API
- Todos os inputs recebidos via HTTP são validados com prepared statements (proteção contra SQL injection)
- O arquivo `.env` é montado no container como somente leitura (`:ro`)
