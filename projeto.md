# Contexto do Projeto
Preciso de uma aplicação completa rodando em Docker para monitorar a velocidade de dois links de internet conectados a um load balancer TP-Link Omada ER605. 

Para isolar os testes de cada link WAN, utilizarei a função de Policy Routing (Roteamento de Política) do roteador Omada. O roteador direcionará o tráfego baseado nos IPs/IDs dos servidores de teste da Ookla. Portanto, o script de medição precisa testar servidores específicos para cada WAN de forma fixa.

# Stack Tecnológica
- Base: Container Docker único (Node.js + dependências do sistema).
- Engine de Teste: Script Bash invocando o `speedtest-cli` oficial da Ookla (formato JSON).
- Backend: Node.js (Express ou Fastify) para agendamento (cron) e API REST.
- Banco de Dados: SQLite3 (armazenado localmente).
- Frontend: Vue.js 3 (Options ou Composition API) + Tailwind CSS + Chart.js (ou ApexCharts).
- Alertas: Web Push Notifications nativas do navegador.

# Requisitos Arquiteturais e de Segurança
1. Segurança de Credenciais: Todas as configurações sensíveis (VAPID keys para push, limites de velocidade, IDs dos servidores) devem ser lidas exclusivamente de um arquivo `.env`. Forneça um arquivo `.env.example`. O arquivo `.env` real e o arquivo do banco de dados SQLite devem estar explicitamente listados no `.gitignore`.
2. Docker: Criar um `Dockerfile` e um `docker-compose.yml`. 
   - Expor o painel na porta local 8020 (`8020:8020`).
   - Mapear volumes externos para: o código-fonte (desenvolvimento), o banco de dados SQLite e o arquivo `.env`.
   - O Dockerfile deve instalar o `speedtest-cli` oficial da Ookla no ambiente Linux do container.

# Especificações dos Componentes

## 1. Agendador e Script de Medição (Bash + Node.js)
- O Node.js deve gerenciar um cron job baseado em um parâmetro do `.env` (ex: `CRON_INTERVAL="*/5 * * * *"`).
- Quando o cron rodar, ele deve executar um script Bash (ou comando de sistema do Node) que faça duas medições sequenciais usando o `speedtest-cli --json --server <ID>`.
- Os IDs dos servidores para a WAN 1 e WAN 2 devem ser obtidos do `.env` (`WAN1_SERVER_ID` e `WAN2_SERVER_ID`).
- O resultado do JSON do speedtest (download em bits, upload em bits, ping, timestamp) deve ser tratado e inserido no banco SQLite. Converta os valores para Mbps.

## 2. Banco de Dados (SQLite3)
Criar uma tabela chamada `speed_tests` com os seguintes campos:
- `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
- `interface_name` (TEXT - ex: 'WAN_1' ou 'WAN_2')
- `download_mbps` (REAL)
- `upload_mbps` (REAL)
- `ping_ms` (REAL)
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

## 3. API Backend (Node.js)
Criar os seguintes endpoints:
- `GET /api/tests`: Retorna o histórico de testes (com paginação ou limite dos últimos X dias) filtrado ou agrupado por interface.
- `GET /api/config`: Retorna as configurações públicas necessárias para o front-end (como os limites de alerta atuais).
- `POST /api/push/register`: Recebe e armazena a inscrição de Push (Subscription) do navegador.

## 4. Frontend & Dashboard (Vue.js)
Uma interface de página única (SPA) limpa e scannable:
- Gráfico de Linhas: Exibir o histórico de download e upload ao longo do tempo. O gráfico deve plotar a WAN 1 e a WAN 2 com cores contrastantes para comparação visual direta.
- Painel de Status Atual: Cards mostrando o resultado do último teste de cada WAN (Download, Upload, Ping e a quantos minutos atrás ocorreu).
- Botão "Ativar Alertas": Solicita a permissão de notificação do navegador e registra o service worker para Push Notifications.

## 5. Sistema de Alertas (Web Push)
- No `.env`, teremos variáveis de limite satisfatório (ex: `WAN1_MIN_DOWNLOAD=50`, `WAN2_MIN_DOWNLOAD=30`).
- Implementar o disparo de Web Push usando a biblioteca `web-push` no Node.js.
- Sempre que um teste terminar e o valor de download for inferior ao limite configurado daquela respectiva WAN, o backend deve disparar uma notificação push para todos os navegadores registrados.
- A mensagem deve dizer explicitamente qual WAN falhou e qual velocidade foi registrada (ex: "Alerta: WAN 1 operando abaixo do limite! Registrado: 24 Mbps").

# O que preciso que você gere:
1. A estrutura de arquivos do projeto.
2. O `Dockerfile` e o `docker-compose.yml`.
3. O arquivo `.env.example` e a lógica de conexão com o SQLite.
4. O código do Backend (Node.js) com a execução do speedtest e lógica de alertas push.
5. O Service Worker e o código do Frontend (Vue.js) com a interface e o gráfico.
