#!/usr/bin/env bash
# Executa o speedtest oficial da Ookla para um servidor específico.
# Uso: ./run_speedtest.sh <SERVER_ID>
# Saída: JSON do resultado no stdout; erros no stderr.

set -euo pipefail

SERVER_ID="${1:-}"

if [[ -z "$SERVER_ID" ]]; then
  echo "[run_speedtest.sh] ERRO: SERVER_ID não fornecido." >&2
  exit 1
fi

speedtest \
  --accept-license \
  --accept-gdpr \
  --format=json \
  --server-id="$SERVER_ID"
