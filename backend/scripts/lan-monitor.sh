#!/usr/bin/env bash
# =============================================================================
# lan-monitor.sh — agente de monitoramento de rede local (Linux / macOS)
#
# Mede a velocidade (download/upload) e a latência entre ESTE computador e o
# servidor Speed Monitor, por toda a rota (WiFi ou cabo), e envia o resultado
# ao servidor. O computador é identificado pelo MAC address da interface ativa
# (máquina = WAN no dashboard).
#
# Requisitos: bash, curl, coreutils (head/awk) — tudo padrão em Linux e macOS.
#
# Uso:
#   ./lan-monitor.sh --server http://192.168.1.10:8020            # loop contínuo
#   ./lan-monitor.sh --server http://192.168.1.10:8020 --once     # uma medição
#   ./lan-monitor.sh --server http://192.168.1.10:8020 --interval 60 --name "Notebook Sala"
#
# Se --interval (ou INTERVAL=) não for informado, o intervalo é obtido
# automaticamente do servidor (GET /api/config, campo cronInterval — o mesmo
# intervalo de coleta configurado para as WANs), convertido para segundos.
# Se não for possível obter, usa 300s (5 min).
#
# Variáveis de ambiente equivalentes: SERVER_URL, INTERVAL, DEVICE_NAME
#
# Rodar em background continuamente:
#   nohup ./lan-monitor.sh --server http://192.168.1.10:8020 >/tmp/lan-monitor.log 2>&1 &
#
# INICIAR JUNTO COM O SISTEMA (recomendado):
#   ./lan-monitor.sh --server http://192.168.1.10:8020 --name "Notebook Sala" --install
#     Linux: cria e ativa um serviço systemd de usuário (lan-monitor.service);
#            volta sozinho após reboot (com lingering) e se o processo cair.
#     macOS: cria e carrega um LaunchAgent (~/Library/LaunchAgents/com.speedmonitor.lan-monitor.plist);
#            inicia no login e é mantido vivo pelo launchd.
#   O script é copiado para ~/.local/share/lan-monitor/ — pode apagar o arquivo baixado depois.
#   O intervalo é resolvido nesse momento (a partir do cronInterval do servidor,
#   a menos que --interval tenha sido informado) e gravado fixo no serviço instalado.
#
# PARAR / REMOVER o monitoramento:
#   ./lan-monitor.sh --uninstall
#     Para o serviço e remove a unidade/plist e a cópia do script.
#   Depois, no dashboard (⚙️ → Dispositivos da rede local), clique em "Remover"
#   para apagar o card e todo o histórico de medições em definitivo. Para só
#   pausar sem perder o histórico, use "Desativar".
#
# LOG DE DIAGNÓSTICO:
#   Cada payload enviado (e a resposta do servidor) é gravado em
#   ~/.local/share/lan-monitor/payloads.log (máx. ~10 KB, as linhas mais
#   antigas são descartadas). Sobrescreva o caminho com LOG_FILE=/caminho.
# =============================================================================

set -euo pipefail

# Locale neutro: garante que awk/printf/curl usem PONTO como separador decimal.
# Sem isso, em máquinas com locale pt_BR/de_DE/etc. os números saem "61,54" e
# quebram o JSON enviado ao servidor (campos zerados / HTTP 400).
export LC_ALL=C
export LANG=C

SERVER_URL="${SERVER_URL:-}"
INTERVAL="${INTERVAL:-}"
DEVICE_NAME="${DEVICE_NAME:-}"
DEFAULT_INTERVAL=300
ONCE=0
DO_INSTALL=0
DO_UNINSTALL=0

# Duração (segundos) de cada fase de throughput e tamanho do bloco por requisição.
PHASE_SECONDS=5
CHUNK_BYTES=$((8 * 1024 * 1024))   # 8 MB

OS="linux"
[[ "$(uname -s)" == "Darwin" ]] && OS="macos"

SERVICE_NAME="lan-monitor"
LAUNCHD_LABEL="com.speedmonitor.lan-monitor"
INSTALL_DIR="${HOME}/.local/share/lan-monitor"
INSTALLED_SCRIPT="${INSTALL_DIR}/lan-monitor.sh"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --server)    SERVER_URL="$2"; shift 2 ;;
    --interval)  INTERVAL="$2"; shift 2 ;;
    --name)      DEVICE_NAME="$2"; shift 2 ;;
    --once)      ONCE=1; shift ;;
    --install)   DO_INSTALL=1; shift ;;
    --uninstall) DO_UNINSTALL=1; shift ;;
    -h|--help)   grep '^#' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Argumento desconhecido: $1" >&2; exit 1 ;;
  esac
done

# ── Desinstalação ───────────────────────────────────────────────────────────
if [[ "$DO_UNINSTALL" -eq 1 ]]; then
  if [[ "$OS" == "macos" ]]; then
    PLIST="${HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
    launchctl unload "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "[lan-monitor] LaunchAgent removido."
  else
    systemctl --user disable --now "${SERVICE_NAME}.service" 2>/dev/null || true
    rm -f "${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
    systemctl --user daemon-reload 2>/dev/null || true
    echo "[lan-monitor] Serviço systemd removido."
  fi
  rm -rf "$INSTALL_DIR"
  echo "[lan-monitor] Pronto. Lembre de clicar em \"Remover\" no dashboard para tirar o card."
  exit 0
fi

if [[ -z "$SERVER_URL" ]]; then
  echo "ERRO: informe o servidor com --server http://<ip>:8020 (ou SERVER_URL=)" >&2
  exit 1
fi
SERVER_URL="${SERVER_URL%/}"

# ── Intervalo: usa o informado (--interval/INTERVAL) ou busca do servidor ──
# Converte uma expressão cron simples ("*" ou "*/N" por campo: minuto hora
# dia-do-mês mês dia-da-semana) no intervalo equivalente em segundos. Só
# suporta o subconjunto usado pelo cronInterval do dashboard (campo */N mais
# à esquerda define o passo; os demais devem ser "*"). Qualquer outro padrão
# cai no fallback.
cron_to_seconds() {
  local expr="$1" minute hour
  read -r minute hour _ <<<"$expr"
  if [[ "$minute" =~ ^\*/([0-9]+)$ ]]; then
    echo $(( ${BASH_REMATCH[1]} * 60 )); return 0
  fi
  if [[ "$minute" == "*" && "$hour" =~ ^\*/([0-9]+)$ ]]; then
    echo $(( ${BASH_REMATCH[1]} * 3600 )); return 0
  fi
  if [[ "$minute" == "*" ]]; then
    echo 60; return 0
  fi
  return 1
}

fetch_interval_from_server() {
  local cron_expr seconds
  cron_expr="$(curl -s -m 10 "$SERVER_URL/api/config" 2>/dev/null \
    | sed -n 's/.*"cronInterval" *: *"\([^"]*\)".*/\1/p')"
  [[ -z "$cron_expr" ]] && return 1
  seconds="$(cron_to_seconds "$cron_expr")" || return 1
  [[ "$seconds" -gt 0 ]] || return 1
  echo "$seconds"
}

if [[ -z "$INTERVAL" ]]; then
  if INTERVAL="$(fetch_interval_from_server)"; then
    echo "[lan-monitor] intervalo obtido do servidor (cronInterval): ${INTERVAL}s"
  else
    INTERVAL="$DEFAULT_INTERVAL"
    echo "[lan-monitor] AVISO: não foi possível obter o intervalo do servidor; usando padrão de ${INTERVAL}s" >&2
  fi
fi

# ── Instalação como serviço de auto-início ──────────────────────────────────
if [[ "$DO_INSTALL" -eq 1 ]]; then
  mkdir -p "$INSTALL_DIR"
  cp "$0" "$INSTALLED_SCRIPT"
  chmod +x "$INSTALLED_SCRIPT"

  args=(--server "$SERVER_URL" --interval "$INTERVAL")
  [[ -n "$DEVICE_NAME" ]] && args+=(--name "$DEVICE_NAME")

  if [[ "$OS" == "macos" ]]; then
    mkdir -p "${HOME}/Library/LaunchAgents"
    PLIST="${HOME}/Library/LaunchAgents/${LAUNCHD_LABEL}.plist"
    {
      echo '<?xml version="1.0" encoding="UTF-8"?>'
      echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
      echo '<plist version="1.0"><dict>'
      echo "  <key>Label</key><string>${LAUNCHD_LABEL}</string>"
      echo '  <key>ProgramArguments</key><array>'
      echo "    <string>/bin/bash</string><string>${INSTALLED_SCRIPT}</string>"
      for a in "${args[@]}"; do echo "    <string>${a}</string>"; done
      echo '  </array>'
      echo '  <key>RunAtLoad</key><true/>'
      echo '  <key>KeepAlive</key><true/>'
      echo "  <key>StandardOutPath</key><string>${INSTALL_DIR}/lan-monitor.log</string>"
      echo "  <key>StandardErrorPath</key><string>${INSTALL_DIR}/lan-monitor.log</string>"
      echo '</dict></plist>'
    } > "$PLIST"
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "[lan-monitor] LaunchAgent instalado e iniciado. Inicia automaticamente no login."
  else
    command -v systemctl >/dev/null || { echo "ERRO: systemd não encontrado; use cron ou nohup." >&2; exit 1; }
    mkdir -p "${HOME}/.config/systemd/user"
    UNIT="${HOME}/.config/systemd/user/${SERVICE_NAME}.service"
    exec_line="/bin/bash ${INSTALLED_SCRIPT}"
    for a in "${args[@]}"; do
      case "$a" in *" "*) exec_line+=" \"$a\"" ;; *) exec_line+=" $a" ;; esac
    done
    {
      echo '[Unit]'
      echo 'Description=Speed Monitor - agente de rede local'
      echo 'After=network-online.target'
      echo ''
      echo '[Service]'
      echo "ExecStart=${exec_line}"
      echo 'Restart=always'
      echo 'RestartSec=30'
      echo ''
      echo '[Install]'
      echo 'WantedBy=default.target'
    } > "$UNIT"
    systemctl --user daemon-reload
    systemctl --user enable --now "${SERVICE_NAME}.service"
    # mantém o serviço rodando mesmo sem sessão aberta / após reboot
    loginctl enable-linger "$(whoami)" 2>/dev/null || \
      echo "[lan-monitor] AVISO: não foi possível ativar 'lingering' (rode: sudo loginctl enable-linger $(whoami)) — sem isso, o monitor só roda enquanto você estiver logado."
    echo "[lan-monitor] Serviço systemd instalado e iniciado. Inicia automaticamente no boot."
    echo "[lan-monitor] Logs: journalctl --user -u ${SERVICE_NAME} -f"
  fi
  exit 0
fi

# ── Identidade da máquina ────────────────────────────────────────────────────
detect_iface() {
  if [[ "$OS" == "macos" ]]; then
    route -n get 1.1.1.1 2>/dev/null | awk '/interface:/{print $2; exit}'
  else
    ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="dev"){print $(i+1); exit}}'
  fi
}

IFACE="$(detect_iface || true)"

detect_mac() {
  local dev="$1"
  [[ -z "$dev" ]] && return 1
  if [[ "$OS" == "macos" ]]; then
    ifconfig "$dev" 2>/dev/null | awk '/ether/{print $2; exit}'
  else
    cat "/sys/class/net/$dev/address" 2>/dev/null
  fi
}

# interface está com link ativo? (evita pegar o MAC de um adaptador
# desconectado/down no fallback abaixo)
iface_is_up() {
  local dev="$1"
  if [[ "$OS" == "macos" ]]; then
    ifconfig "$dev" 2>/dev/null | grep -q 'status: active'
  else
    [[ "$(cat "/sys/class/net/$dev/operstate" 2>/dev/null)" == "up" ]]
  fi
}

# se a interface da rota default não tiver link ativo, não confia nela
if [[ -n "$IFACE" ]] && ! iface_is_up "$IFACE"; then
  IFACE=""
fi

RAW_MAC="$(detect_mac "$IFACE" || true)"

# fallback: primeiro MAC de interface FÍSICA e COM LINK ATIVO,
# não-loopback, não-zerado (ignora interfaces virtuais comuns)
if [[ -z "$RAW_MAC" ]]; then
  if [[ "$OS" == "macos" ]]; then
    for d in $(ifconfig -l 2>/dev/null); do
      case "$d" in lo*|utun*|awdl*|llw*|bridge*|gif*|stf*|p2p*|anpi*) continue ;; esac
      iface_is_up "$d" || continue
      m="$(ifconfig "$d" 2>/dev/null | awk '/ether/{print $2; exit}')"
      [[ -z "$m" || "$m" == "00:00:00:00:00:00" ]] && continue
      RAW_MAC="$m"; IFACE="$d"; break
    done
  else
    for f in /sys/class/net/*/address; do
      d="$(basename "$(dirname "$f")")"
      case "$d" in lo|docker*|veth*|br-*|virbr*|tun*|tap*|vmnet*|vboxnet*|wg*) continue ;; esac
      iface_is_up "$d" || continue
      m="$(cat "$f")"
      [[ "$m" == "00:00:00:00:00:00" ]] && continue
      RAW_MAC="$m"; IFACE="$d"; break
    done
  fi
fi

# último recurso: se nenhuma interface com link ativo foi encontrada,
# volta a aceitar qualquer MAC não-loopback/não-zero (mesmo down), para
# não travar o script — mas isso não deveria ocorrer em uso normal.
if [[ -z "$RAW_MAC" ]]; then
  if [[ "$OS" == "macos" ]]; then
    RAW_MAC="$(ifconfig 2>/dev/null | awk '/ether/{print $2; exit}')"
  else
    for f in /sys/class/net/*/address; do
      d="$(basename "$(dirname "$f")")"
      [[ "$d" == "lo" ]] && continue
      m="$(cat "$f")"
      [[ "$m" == "00:00:00:00:00:00" ]] && continue
      RAW_MAC="$m"; IFACE="$d"; break
    done
  fi
fi

MACHINE_ID="$(echo "$RAW_MAC" | tr 'A-Z' 'a-z' | tr -cd '0-9a-f')"
if [[ -z "$MACHINE_ID" ]]; then
  echo "ERRO: não foi possível determinar o MAC address desta máquina." >&2
  exit 1
fi

detect_conn_type() {
  local dev="$1"
  [[ -z "$dev" ]] && { echo "unknown"; return; }
  if [[ "$OS" == "macos" ]]; then
    if networksetup -listallhardwareports 2>/dev/null \
        | awk -v d="$dev" '/Hardware Port/{hp=$0} $0 ~ "Device: "d {print hp}' \
        | grep -qi 'wi-fi\|airport'; then
      echo "wifi"
    else
      echo "ethernet"
    fi
  else
    if [[ -d "/sys/class/net/$dev/wireless" ]] || [[ -L "/sys/class/net/$dev/phy80211" ]]; then
      echo "wifi"
    else
      echo "ethernet"
    fi
  fi
}

CONN_TYPE="$(detect_conn_type "$IFACE")"
HOSTNAME_VAL="$(hostname 2>/dev/null || echo "$MACHINE_ID")"

echo "[lan-monitor] máquina=$HOSTNAME_VAL  iface=${IFACE:-?}  mac=$MACHINE_ID  conn=$CONN_TYPE  os=$OS"
echo "[lan-monitor] servidor=$SERVER_URL  intervalo=${INTERVAL}s  once=$ONCE"

TMP_UP="$(mktemp)"
trap 'rm -f "$TMP_UP"' EXIT
head -c "$CHUNK_BYTES" /dev/urandom > "$TMP_UP"

# ── Fases de medição ────────────────────────────────────────────────────────
# Regras:
#  - cada função SEMPRE imprime um número válido no stdout (nunca vazio);
#  - o corte de tempo usa o $SECONDS do bash (inteiro, monotônico, funciona
#    no systemd) — nada de comparar timestamps float grandes no awk, que perde
#    precisão / vira notação científica;
#  - a duração real p/ o cálculo de Mbps vem de dois `date +%s.%N` próximos
#    (subtração de floats de mesma ordem = precisão OK), com fallback p/ o
#    próprio $SECONDS decorrido.

epoch_ns() { date +%s%N 2>/dev/null || echo "$(( $(date +%s) * 1000000000 ))"; }

# duração em segundos (float) entre dois epoch_ns; fallback = arg 3 (inteiro)
dur_s() { awk -v a="$1" -v b="$2" -v fb="$3" 'BEGIN{ d=(b-a)/1e9; if(d<=0)d=fb; if(d<=0)d=1; printf "%.6f", d }'; }

measure_ping() {
  # 12 amostras; descarta a 1ª (aquecimento). Ecoa "media jitter" em ms.
  local n=12 i t vals=()
  for ((i=0; i<n; i++)); do
    t="$(curl -s -m 10 -o /dev/null -w '%{time_total}' "$SERVER_URL/api/lan/ping?_=$(epoch_ns)-$i" 2>/dev/null)" || t=""
    [ -n "$t" ] && vals+=("$t")
  done
  if [ "${#vals[@]}" -eq 0 ]; then echo "0 0"; return 0; fi
  printf '%s\n' "${vals[@]}" | awk '
    { if (NR>1) { v[n++]=$1; s+=$1 } else { first=$1 } }
    END{
      if (n==0){ printf "%.2f 0\n", first*1000; exit }
      m=s/n; d=0;
      for(k=0;k<n;k++) d+=(v[k]-m)*(v[k]-m);
      printf "%.2f %.2f\n", m*1000, sqrt(d/n)*1000
    }'
}

measure_download() {
  local start_s=$SECONDS total=0 sz ns0 ns1 iters=0
  ns0="$(epoch_ns)"
  while [ $(( SECONDS - start_s )) -lt "$PHASE_SECONDS" ]; do
    sz="$(curl -s -m 30 -o /dev/null -w '%{size_download}' \
          "$SERVER_URL/api/lan/download?bytes=$CHUNK_BYTES&_=$(epoch_ns)" 2>/dev/null)" || sz=0
    case "$sz" in ''|*[!0-9]*) sz=0 ;; esac
    total=$(( total + sz ))
    iters=$(( iters + 1 ))
  done
  ns1="$(epoch_ns)"
  awk -v bytes="$total" -v s="$(dur_s "$ns0" "$ns1" "$(( SECONDS - start_s ))")" \
    'BEGIN{ if(bytes<=0){print "0.00"; exit} printf "%.2f\n", (bytes*8)/s/1000000 }'
}

measure_upload() {
  local start_s=$SECONDS total=0 ns0 ns1
  ns0="$(epoch_ns)"
  while [ $(( SECONDS - start_s )) -lt "$PHASE_SECONDS" ]; do
    if curl -s -m 30 -o /dev/null -w '' -X POST --data-binary "@$TMP_UP" \
         -H 'Content-Type: application/octet-stream' \
         "$SERVER_URL/api/lan/upload?_=$(epoch_ns)" 2>/dev/null; then
      total=$(( total + CHUNK_BYTES ))
    fi
  done
  ns1="$(epoch_ns)"
  awk -v bytes="$total" -v s="$(dur_s "$ns0" "$ns1" "$(( SECONDS - start_s ))")" \
    'BEGIN{ if(bytes<=0){print "0.00"; exit} printf "%.2f\n", (bytes*8)/s/1000000 }'
}

json_escape() { printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'; }

# Normaliza um número: troca vírgula decimal por ponto e valida. Se não for um
# número reconhecível (inteiro/decimal, sinal opcional), devolve o fallback.
num_or() {
  local v="${1//,/.}"
  case "$v" in
    ''|*[!0-9.+-]*) echo "$2" ;;
    *)              echo "$v" ;;
  esac
}

# ── Log de payloads ────────────────────────────────────────────────────────
# Registra cada payload enviado + resposta do servidor. Mantém no máximo
# LOG_MAX_BYTES (~10 KB): ao passar disso, descarta as linhas mais antigas.
LOG_FILE="${LOG_FILE:-${INSTALL_DIR}/payloads.log}"
LOG_MAX_BYTES=10240

log_payload() {
  local line="$1"
  mkdir -p "$(dirname "$LOG_FILE")" 2>/dev/null || return 0
  printf '%s\n' "$line" >> "$LOG_FILE" 2>/dev/null || return 0

  # rotação: se passou do teto, mantém só o final do arquivo (~metade do teto)
  local size
  size="$(wc -c < "$LOG_FILE" 2>/dev/null || echo 0)"
  if [ "$size" -gt "$LOG_MAX_BYTES" ]; then
    local keep=$(( LOG_MAX_BYTES / 2 ))
    tail -c "$keep" "$LOG_FILE" > "${LOG_FILE}.tmp" 2>/dev/null && mv "${LOG_FILE}.tmp" "$LOG_FILE"
    # descarta a primeira linha (provavelmente cortada no meio)
    sed -i '1d' "$LOG_FILE" 2>/dev/null || true
  fi
}

run_cycle() {
  local ping_out ping_ms jitter_ms dl ul payload http body ts

  ping_out="$(measure_ping)" || ping_out="0 0"
  ping_ms="$(num_or "${ping_out%% *}" 0)"
  jitter_ms="$(num_or "${ping_out##* }" 0)"
  dl="$(num_or "$(measure_download || echo 0)" 0)"
  ul="$(num_or "$(measure_upload   || echo 0)" 0)"

  payload="{\"machineId\":\"$MACHINE_ID\",\"hostname\":\"$(json_escape "$HOSTNAME_VAL")\",\"os\":\"$OS\",\"connType\":\"$CONN_TYPE\",\"download\":$dl,\"upload\":$ul,\"ping\":$ping_ms,\"jitter\":$jitter_ms"
  [[ -n "$DEVICE_NAME" ]] && payload="$payload,\"name\":\"$(json_escape "$DEVICE_NAME")\""
  payload="$payload}"

  http="$(curl -s -m 15 -o /tmp/lan-monitor-resp.$$ -w '%{http_code}' -X POST -H 'Content-Type: application/json' \
          -d "$payload" "$SERVER_URL/api/lan/results" 2>/dev/null)" || http=000
  body="$(cat /tmp/lan-monitor-resp.$$ 2>/dev/null)"; rm -f "/tmp/lan-monitor-resp.$$"

  ts="$(date '+%Y-%m-%d %H:%M:%S')"
  log_payload "[$ts] HTTP $http  ->  $payload${body:+  <= $body}"

  printf '[%s] ↓%s Mbps  ↑%s Mbps  ping %s ms (jitter %s)  → HTTP %s\n' \
    "$ts" "$dl" "$ul" "$ping_ms" "$jitter_ms" "$http"

  case "$http" in
    2*) : ;;
    *)  echo "[lan-monitor] servidor recusou (HTTP $http): ${body:-sem corpo}" >&2
        echo "[lan-monitor] payload enviado: $payload" >&2
        return 1 ;;
  esac
}

if [[ "$ONCE" -eq 1 ]]; then
  run_cycle
else
  while true; do
    run_cycle || echo "[lan-monitor] ciclo falhou, tentando de novo no próximo intervalo" >&2
    sleep "$INTERVAL"
  done
fi
