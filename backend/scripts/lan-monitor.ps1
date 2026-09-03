<#
=============================================================================
 lan-monitor.ps1 - agente de monitoramento de rede local (Windows 10+)

 Mede a velocidade (download/upload) e a latencia entre ESTE computador e o
 servidor Speed Monitor, por toda a rota (WiFi ou cabo), e envia o resultado
 ao servidor. O computador e identificado pelo MAC address da interface ativa
 (maquina = WAN no dashboard).

 Requisitos: Windows PowerShell 5.1 (o que vem com o Windows 10/11) ou
 PowerShell 7+. Nenhuma dependencia externa — usa System.Net.WebRequest.

 Uso:
   .\lan-monitor.ps1 -Server http://192.168.1.10:8020                 # loop continuo
   .\lan-monitor.ps1 -Server http://192.168.1.10:8020 -Once           # uma medicao
   .\lan-monitor.ps1 -Server http://192.168.1.10:8020 -Interval 60 -Name "PC Sala"

 Se -Interval nao for informado, o intervalo e obtido automaticamente do
 servidor (GET /api/config, campo cronInterval -- o mesmo intervalo de coleta
 configurado para as WANs), convertido para segundos. Se nao for possivel
 obter, usa 300s (5 min).

 Se a execucao de scripts estiver bloqueada:
   powershell -ExecutionPolicy Bypass -File .\lan-monitor.ps1 -Server http://192.168.1.10:8020

 INICIAR JUNTO COM O WINDOWS (recomendado):
   powershell -ExecutionPolicy Bypass -File .\lan-monitor.ps1 `
     -Server http://192.168.1.10:8020 -Name "PC Sala" -Install
   Cria uma Tarefa Agendada "SpeedMonitor-LanMonitor" com gatilho "Ao fazer logon",
   que roda em janela oculta e e reiniciada pelo Windows se cair. O script e copiado
   para %LOCALAPPDATA%\SpeedMonitor\ -- pode apagar o arquivo baixado depois.
   O intervalo e resolvido nesse momento (a partir do cronInterval do servidor,
   a menos que -Interval tenha sido informado) e gravado fixo na tarefa instalada.

 PARAR / REMOVER o monitoramento:
   powershell -ExecutionPolicy Bypass -File .\lan-monitor.ps1 -Uninstall
   Para a tarefa, remove-a e apaga a copia do script. Depois, no dashboard
   (engrenagem -> Dispositivos da rede local), clique em "Remover" para tirar o
   card (o historico e preservado; "Remover" de novo apaga em definitivo).

 LOG DE DIAGNOSTICO:
   Cada payload enviado (e a resposta do servidor) e gravado em
   %LOCALAPPDATA%\SpeedMonitor\payloads.log (max. ~10 KB, as linhas mais
   antigas sao descartadas).
=============================================================================
#>

param(
  [string] $Server = "",
  [int]    $Interval = 0,
  [string] $Name = "",
  [switch] $Once,
  [switch] $Install,
  [switch] $Uninstall
)

$DefaultInterval = 300

$ErrorActionPreference = "Stop"

# Cultura invariante: garante PONTO como separador decimal em ConvertTo-Json e
# nas formatacoes de numero. Sem isso, num Windows pt-BR os valores sairiam
# "61,54" e quebrariam o JSON enviado ao servidor (campos zerados / HTTP 400).
[System.Threading.Thread]::CurrentThread.CurrentCulture = [System.Globalization.CultureInfo]::InvariantCulture

$TaskName    = "SpeedMonitor-LanMonitor"
$InstallDir  = Join-Path $env:LOCALAPPDATA "SpeedMonitor"
$InstalledScript = Join-Path $InstallDir "lan-monitor.ps1"
$LogFile     = Join-Path $InstallDir "payloads.log"
$LogMaxBytes = 10240

# ── Desinstalacao ──────────────────────────────────────────────────────────
if ($Uninstall) {
  try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "[lan-monitor] Tarefa agendada removida."
  } catch {
    schtasks /Delete /TN $TaskName /F 2>$null | Out-Null
  }
  if (Test-Path $InstallDir) { Remove-Item -Recurse -Force $InstallDir }
  Write-Host "[lan-monitor] Pronto. Lembre de clicar em `"Remover`" no dashboard para tirar o card."
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Server)) {
  Write-Error "Informe o servidor com -Server http://<ip>:8020"
  exit 1
}
$Server = $Server.TrimEnd("/")

# ── Intervalo: usa o informado (-Interval) ou busca do servidor ───────────
# Converte uma expressao cron simples ("*" ou "*/N" por campo: minuto hora
# dia-do-mes mes dia-da-semana) no intervalo equivalente em segundos. So
# suporta o subconjunto usado pelo cronInterval do dashboard (campo */N mais
# a esquerda define o passo; os demais devem ser "*"). Qualquer outro padrao
# cai no fallback.
function ConvertFrom-CronToSeconds([string] $Expr) {
  $parts = $Expr -split '\s+'
  if ($parts.Count -lt 2) { return $null }
  $minute = $parts[0]; $hour = $parts[1]
  if ($minute -match '^\*/(\d+)$') { return [int]$Matches[1] * 60 }
  if ($minute -eq '*' -and $hour -match '^\*/(\d+)$') { return [int]$Matches[1] * 3600 }
  if ($minute -eq '*') { return 60 }
  return $null
}

function Get-IntervalFromServer {
  try {
    $req = [System.Net.WebRequest]::Create("$Server/api/config")
    $req.Method = "GET"
    $req.Timeout = 10000
    $req.Proxy = $null
    $resp = $req.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $sr.ReadToEnd(); $sr.Close(); $resp.Close()
    $cronExpr = ($body | ConvertFrom-Json).cronInterval
    if ([string]::IsNullOrWhiteSpace($cronExpr)) { return $null }
    return ConvertFrom-CronToSeconds $cronExpr
  } catch {
    return $null
  }
}

if ($Interval -le 0) {
  $fromServer = Get-IntervalFromServer
  if ($fromServer) {
    $Interval = $fromServer
    Write-Host "[lan-monitor] intervalo obtido do servidor (cronInterval): ${Interval}s"
  } else {
    $Interval = $DefaultInterval
    Write-Warning "Nao foi possivel obter o intervalo do servidor; usando padrao de ${Interval}s"
  }
}

# ── Instalacao como Tarefa Agendada de auto-inicio ─────────────────────────
if ($Install) {
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  Copy-Item -Path $PSCommandPath -Destination $InstalledScript -Force

  $argLine = "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$InstalledScript`" -Server $Server -Interval $Interval"
  if (-not [string]::IsNullOrWhiteSpace($Name)) { $argLine += " -Name `"$Name`"" }

  $action   = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argLine
  $trigger  = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
                -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999
  try {
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
      -Description "Speed Monitor - agente de rede local" -Force | Out-Null
    Start-ScheduledTask -TaskName $TaskName
    Write-Host "[lan-monitor] Tarefa agendada instalada e iniciada. Roda a cada logon, em janela oculta."
  } catch {
    Write-Error "Falha ao registrar a tarefa: $($_.Exception.Message)"
    exit 1
  }
  exit 0
}

$PhaseSeconds = 5
$ChunkBytes   = 8 * 1024 * 1024   # 8 MB

# ── Identidade da maquina ───────────────────────────────────────────────────

function Get-ActiveAdapter {
  # adaptador "Up" com rota default; desempata pelo maior LinkSpeed
  $up = Get-NetAdapter -Physical -ErrorAction SilentlyContinue |
        Where-Object { $_.Status -eq 'Up' }
  if (-not $up) { $up = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq 'Up' } }

  $routed = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue |
            Sort-Object RouteMetric |
            Select-Object -First 1
  if ($routed) {
    $match = $up | Where-Object { $_.ifIndex -eq $routed.ifIndex }
    if ($match) { return $match }
  }
  return ($up | Sort-Object -Property LinkSpeed -Descending | Select-Object -First 1)
}

$adapter = Get-ActiveAdapter
if (-not $adapter) { Write-Error "Nao foi possivel encontrar um adaptador de rede ativo."; exit 1 }

$machineId = ($adapter.MacAddress -replace '[^0-9A-Fa-f]', '').ToLower()
if ([string]::IsNullOrWhiteSpace($machineId)) { Write-Error "Nao foi possivel determinar o MAC address."; exit 1 }

$connType = "ethernet"
$media = "$($adapter.PhysicalMediaType) $($adapter.InterfaceDescription) $($adapter.Name)"
if ($media -match 'Wi-?Fi|802\.11|Wireless') { $connType = "wifi" }

$hostName = $env:COMPUTERNAME
if ([string]::IsNullOrWhiteSpace($hostName)) { $hostName = $machineId }

Write-Host "[lan-monitor] maquina=$hostName  iface=$($adapter.Name)  mac=$machineId  conn=$connType  os=windows"
Write-Host "[lan-monitor] servidor=$Server  intervalo=${Interval}s  once=$($Once.IsPresent)"

# HTTP via System.Net.WebRequest (nativo do .NET Framework — funciona no
# Windows PowerShell 5.1, ao contrário de System.Net.Http.HttpClient).
[Net.ServicePointManager]::Expect100Continue = $false
[Net.ServicePointManager]::DefaultConnectionLimit = 64
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$uploadPayload = New-Object byte[] $ChunkBytes
(New-Object Random).NextBytes($uploadPayload)

function Invoke-Get([string] $Url, [switch] $Discard) {
  # retorna o nº de bytes lidos do corpo (0 em erro)
  $req = [System.Net.WebRequest]::Create($Url)
  $req.Method = "GET"
  $req.Timeout = 30000
  $req.ReadWriteTimeout = 30000
  $req.KeepAlive = $true
  $req.Proxy = $null
  $bytes = 0L
  try {
    $resp = $req.GetResponse()
    $stream = $resp.GetResponseStream()
    $buf = New-Object byte[] 65536
    while (($n = $stream.Read($buf, 0, $buf.Length)) -gt 0) { $bytes += $n }
    $stream.Close(); $resp.Close()
  } catch { return 0L }
  return $bytes
}

function Invoke-Post([string] $Url, [byte[]] $Body) {
  $req = [System.Net.WebRequest]::Create($Url)
  $req.Method = "POST"
  $req.ContentType = "application/octet-stream"
  $req.Timeout = 30000
  $req.ReadWriteTimeout = 30000
  $req.KeepAlive = $true
  $req.Proxy = $null
  $req.ContentLength = $Body.Length
  try {
    $rs = $req.GetRequestStream()
    $rs.Write($Body, 0, $Body.Length)
    $rs.Close()
    $resp = $req.GetResponse()
    $resp.GetResponseStream().Close()
    $resp.Close()
    return $true
  } catch { return $false }
}

function Invoke-PostJson([string] $Url, [string] $Json) {
  # retorna @{ code = <int|0>; body = <string> }
  $req = [System.Net.WebRequest]::Create($Url)
  $req.Method = "POST"
  $req.ContentType = "application/json"
  $req.Timeout = 15000
  $req.Proxy = $null
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($Json)
  $req.ContentLength = $bytes.Length
  try {
    $rs = $req.GetRequestStream(); $rs.Write($bytes, 0, $bytes.Length); $rs.Close()
    $resp = $req.GetResponse()
    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
    $body = $sr.ReadToEnd(); $sr.Close(); $code = [int]$resp.StatusCode; $resp.Close()
    return @{ code = $code; body = $body }
  } catch [System.Net.WebException] {
    $body = ""
    try {
      if ($_.Exception.Response) {
        $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $body = $sr.ReadToEnd(); $sr.Close()
        $code = [int]$_.Exception.Response.StatusCode
      } else { $code = 0 }
    } catch { $code = 0 }
    return @{ code = $code; body = $body }
  } catch {
    return @{ code = 0; body = "$($_.Exception.Message)" }
  }
}

# ── Fases de medicao ───────────────────────────────────────────────────────

function Measure-Ping {
  $samples = 12
  $vals = New-Object System.Collections.Generic.List[double]
  for ($i = 0; $i -lt $samples; $i++) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    [void](Invoke-Get "$Server/api/lan/ping?_=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())-$i")
    $sw.Stop()
    if ($i -gt 0) { $vals.Add($sw.Elapsed.TotalMilliseconds) }  # descarta aquecimento
  }
  if ($vals.Count -eq 0) { return @{ ping = 0.0; jitter = 0.0 } }
  $mean = ($vals | Measure-Object -Average).Average
  $var  = ($vals | ForEach-Object { ($_ - $mean) * ($_ - $mean) } | Measure-Object -Average).Average
  return @{ ping = [math]::Round($mean, 2); jitter = [math]::Round([math]::Sqrt($var), 2) }
}

function Measure-Download {
  $deadline = (Get-Date).AddSeconds($PhaseSeconds)
  $total = 0L
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ((Get-Date) -lt $deadline) {
    $url = "$Server/api/lan/download?bytes=$ChunkBytes&_=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())"
    $total += (Invoke-Get $url)
  }
  $sw.Stop()
  $sec = $sw.Elapsed.TotalSeconds
  if ($sec -le 0 -or $total -le 0) { return 0.0 }
  return [math]::Round(($total * 8) / $sec / 1000000, 2)
}

function Measure-Upload {
  $deadline = (Get-Date).AddSeconds($PhaseSeconds)
  $total = 0L
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ((Get-Date) -lt $deadline) {
    if (Invoke-Post "$Server/api/lan/upload?_=$([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())" $uploadPayload) {
      $total += $ChunkBytes
    }
  }
  $sw.Stop()
  $sec = $sw.Elapsed.TotalSeconds
  if ($sec -le 0 -or $total -le 0) { return 0.0 }
  return [math]::Round(($total * 8) / $sec / 1000000, 2)
}

# ── Log de payloads ────────────────────────────────────────────────────────
# Registra cada payload enviado + resposta. Mantem no maximo $LogMaxBytes
# (~10 KB): ao passar disso, descarta as linhas mais antigas.
function Write-PayloadLog([string] $Line) {
  try {
    $dir = Split-Path -Parent $LogFile
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
    Add-Content -Path $LogFile -Value $Line -Encoding UTF8

    $size = (Get-Item $LogFile -ErrorAction SilentlyContinue).Length
    if ($size -gt $LogMaxBytes) {
      $keepLines = [int]([math]::Ceiling($LogMaxBytes / 2 / 160))  # ~160 bytes/linha
      $tail = Get-Content -Path $LogFile -Tail $keepLines
      Set-Content -Path $LogFile -Value $tail -Encoding UTF8
    }
  } catch { }
}

function Invoke-Cycle {
  $p  = Measure-Ping
  $dl = Measure-Download
  $ul = Measure-Upload

  $body = [ordered]@{
    machineId = $machineId
    hostname  = $hostName
    os        = "windows"
    connType  = $connType
    download  = $dl
    upload    = $ul
    ping      = $p.ping
    jitter    = $p.jitter
  }
  if (-not [string]::IsNullOrWhiteSpace($Name)) { $body.name = $Name }

  $json = ($body | ConvertTo-Json -Compress)
  $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

  $r = Invoke-PostJson "$Server/api/lan/results" $json
  $status = if ($r.code -ge 200 -and $r.code -lt 300) { "HTTP $($r.code)" } `
            elseif ($r.code -gt 0) { "HTTP $($r.code) (recusado)" } `
            else { "sem conexao" }

  Write-PayloadLog ("[{0}] {1}  ->  {2}{3}" -f $ts, $status, $json, $(if ($r.body) { "  <= $($r.body)" } else { "" }))

  "{0}  down {1} Mbps  up {2} Mbps  ping {3} ms (jitter {4})  -> {5}" -f `
    $ts, $dl, $ul, $p.ping, $p.jitter, $status | Write-Host
}

if ($Once) {
  Invoke-Cycle
} else {
  while ($true) {
    try { Invoke-Cycle } catch { Write-Warning "ciclo falhou: $($_.Exception.Message)" }
    Start-Sleep -Seconds $Interval
  }
}
