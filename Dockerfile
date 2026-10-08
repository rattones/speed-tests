# ── Estágio 1: build do frontend (Vite + Tailwind) ─────────────────────────
FROM node:20-slim AS frontend-build

WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# ── Estágio 2: aplicação ──────────────────────────────────────────────────
FROM node:20-slim

# ── Dependências do sistema ────────────────────────────────────────────────
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    gnupg \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ── Instalar speedtest oficial da Ookla ───────────────────────────────────
# Repositório oficial: https://www.speedtest.net/apps/cli
RUN curl -fsSL https://packagecloud.io/install/repositories/ookla/speedtest-cli/script.deb.sh | bash \
    && apt-get install -y --no-install-recommends speedtest \
    && rm -rf /var/lib/apt/lists/*

# Aceitar licença e GDPR automaticamente na primeira execução
RUN mkdir -p /root/.config/ookla \
    && echo '{"Settings":{"LicenseAccepted":"604ec27f828456331ebf441826292c49276bd3c9","GDPRTimeStamp":1609459200}}' \
       > /root/.config/ookla/speedtest-cli.json

# ── Diretórios ────────────────────────────────────────────────────────────
WORKDIR /app
RUN mkdir -p /data

# ── Dependências Node.js (cache de camadas) ───────────────────────────────
COPY backend/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund

# ── Código da aplicação ───────────────────────────────────────────────────
COPY backend/ ./
# Frontend compilado fica fora de /app para não ser encoberto pelo volume
# ./backend:/app do docker-compose
COPY --from=frontend-build /build/dist /frontend
ENV STATIC_DIR=/frontend
COPY manifest.json ./manifest.json

# Garantir que o script de teste é executável
RUN chmod +x /app/scripts/run_speedtest.sh

# ── Porta e inicialização ─────────────────────────────────────────────────
EXPOSE 8020
CMD ["node", "server.js"]
