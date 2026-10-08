require('dotenv').config();

const express = require('express');
const path = require('path');

const testsRouter  = require('./routes/tests');
const configRouter = require('./routes/config');
const lanRouter    = require('./routes/lan');
const versionRouter = require('./routes/version');
const { startScheduler } = require('./scheduler');

// db.js inicializa o banco na importação (cria tabelas se não existirem)
require('./db');

const app = express();
const PORT = process.env.PORT || 8020;

// Build do frontend (Vite). No container fica em /frontend (definido no
// Dockerfile); fora dele, o padrão é ./public.
const STATIC_DIR = process.env.STATIC_DIR || path.join(__dirname, 'public');

// ── Middlewares ────────────────────────────────────────────────────────────
// O router de rede local é montado ANTES do express.json() global: seus
// endpoints /download e /upload lidam com corpos binários grandes e fazem o
// próprio parsing (JSON local só nas rotas que precisam).
app.use('/api/lan', lanRouter);

app.use(express.json());
app.use(express.static(STATIC_DIR));

// ── Rotas da API ───────────────────────────────────────────────────────────
app.use('/api/tests',  testsRouter);
app.use('/api/config', configRouter);
app.use('/api/version', versionRouter);

// ── Fallback SPA ───────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(STATIC_DIR, 'index.html'));
});

// ── Inicialização ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[SERVER] Rodando em http://localhost:${PORT}`);
  startScheduler();
});
