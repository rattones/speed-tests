require('dotenv').config();

const express = require('express');
const path = require('path');

const testsRouter  = require('./routes/tests');
const configRouter = require('./routes/config');
const { startScheduler } = require('./scheduler');

// db.js inicializa o banco na importação (cria tabelas se não existirem)
require('./db');

const app = express();
const PORT = process.env.PORT || 8020;

// ── Middlewares ────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Rotas da API ───────────────────────────────────────────────────────────
app.use('/api/tests',  testsRouter);
app.use('/api/config', configRouter);

// ── Fallback SPA ───────────────────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Inicialização ──────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[SERVER] Rodando em http://localhost:${PORT}`);
  startScheduler();
});
