<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" @click.self="$emit('close')">
    <div class="bg-gray-800 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">

      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <h2 class="text-lg font-bold text-white">Monitorar um computador</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white text-xl leading-none">✕</button>
      </div>

      <div class="p-6 space-y-6 text-sm text-gray-300">
        <p>
          O agente roda direto no computador (fora do navegador), mede a velocidade e a
          latência até este servidor de tempos em tempos e envia os resultados. Cada
          máquina aparece como um card e uma linha no gráfico — identificada pelo
          <strong>MAC address</strong> da placa de rede ativa.
        </p>

        <!-- Seletor de SO -->
        <div class="flex gap-2">
          <button
            v-for="opt in osOptions"
            :key="opt.key"
            @click="os = opt.key"
            class="px-3 py-1.5 rounded text-sm font-medium transition-colors"
            :class="os === opt.key ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
          >{{ opt.label }}</button>
        </div>

        <!-- Passos -->
        <ol class="space-y-4 list-decimal list-inside">
          <li>
            <span class="text-gray-200 font-medium">Baixe o agente</span>
            <div class="mt-2">
              <a
                :href="`/api/lan/agent/${os}`"
                class="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 text-xs font-medium transition-colors"
              >⬇ Baixar {{ agentFile }}</a>
            </div>
          </li>

          <li>
            <span class="text-gray-200 font-medium">Rode uma medição de teste</span>
            <pre class="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre">{{ testCmd }}</pre>
          </li>

          <li>
            <span class="text-gray-200 font-medium">Deixe monitorando — iniciando junto com o sistema</span>
            <p class="mt-1 text-xs text-gray-400">
              O comando abaixo instala o agente como serviço de auto-início: ele volta
              sozinho depois que o computador reinicia e é reiniciado se o processo cair.
              <strong>Não é preciso recriar nada a cada reboot.</strong> O intervalo entre
              medições é obtido automaticamente das configurações do servidor (⚙️ →
              intervalo de coleta das WANs); para usar outro valor, adicione
              <span class="font-mono">--interval SEGUNDOS</span>
              (<span class="font-mono">-Interval</span> no Windows).
            </p>
            <pre class="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre">{{ installCmd }}</pre>
            <p class="mt-2 text-xs text-gray-500" v-html="installHint"></p>

            <details class="mt-3">
              <summary class="text-xs text-gray-400 cursor-pointer hover:text-gray-200">
                Alternativa: rodar em background só nesta sessão (não sobrevive ao reboot)
              </summary>
              <pre class="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre">{{ loopCmd }}</pre>
            </details>
          </li>

          <li>
            <span class="text-gray-200 font-medium">Parar / excluir o monitoramento</span>
            <p class="mt-1 text-xs text-gray-400">
              Na máquina monitorada, remova o serviço de auto-início:
            </p>
            <pre class="mt-2 bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-green-300 overflow-x-auto whitespace-pre">{{ uninstallCmd }}</pre>
            <p class="mt-2 text-xs text-gray-500">
              Depois, aqui no dashboard, abra <span class="font-mono">⚙️</span> →
              <strong>Dispositivos da rede local</strong> e clique em <strong>Remover</strong>
              no dispositivo — apaga o card e todo o histórico de medições em definitivo.
              Para só pausar sem perder o histórico, use <strong>Desativar</strong>.
            </p>
          </li>
        </ol>

        <div class="bg-gray-900 border border-gray-700 rounded-lg p-3 text-xs text-gray-400">
          <p>Endereço deste servidor: <span class="font-mono text-gray-200">{{ origin }}</span></p>
          <p class="mt-1">
            A porta <span class="font-mono text-gray-200">{{ port }}</span> precisa estar acessível
            na rede local a partir do computador monitorado.
          </p>
          <p class="mt-2 pt-2 border-t border-gray-800">
            Diagnóstico: se os dados chegarem zerados, veja o log de payloads em
            <span class="font-mono text-gray-200">{{ logPath }}</span>
            (últimas medições enviadas + resposta do servidor).
          </p>
        </div>
      </div>

      <div class="px-6 py-4 border-t border-gray-700 flex justify-end">
        <button
          @click="$emit('close')"
          class="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors font-medium"
        >Entendi</button>
      </div>

    </div>
  </div>
</template>

<script>
export default {
  name: 'LanHelpModal',

  emits: ['close'],

  data() {
    return {
      os: 'linux',
      osOptions: [
        { key: 'linux',   label: 'Linux' },
        { key: 'macos',   label: 'macOS' },
        { key: 'windows', label: 'Windows' },
      ],
    };
  },

  computed: {
    origin() {
      return window.location.origin;
    },
    port() {
      return window.location.port || (window.location.protocol === 'https:' ? '443' : '80');
    },
    agentFile() {
      return this.os === 'windows' ? 'lan-monitor.ps1' : 'lan-monitor.sh';
    },
    logPath() {
      return this.os === 'windows'
        ? '%LOCALAPPDATA%\\SpeedMonitor\\payloads.log'
        : '~/.local/share/lan-monitor/payloads.log';
    },
    testCmd() {
      if (this.os === 'windows') {
        return [
          '# PowerShell, na pasta onde salvou o arquivo:',
          `powershell -ExecutionPolicy Bypass -File .\\lan-monitor.ps1 \``,
          `  -Server ${this.origin} -Once -Name "Meu PC"`,
        ].join('\n');
      }
      return [
        '# Terminal, na pasta onde salvou o arquivo:',
        'chmod +x lan-monitor.sh',
        `./lan-monitor.sh --server ${this.origin} --once --name "Meu PC"`,
      ].join('\n');
    },
    installCmd() {
      if (this.os === 'windows') {
        return [
          '# instala como Tarefa Agendada (gatilho "Ao fazer logon"):',
          '# intervalo é obtido automaticamente das configurações do servidor',
          `powershell -ExecutionPolicy Bypass -File .\\lan-monitor.ps1 \``,
          `  -Server ${this.origin} -Name "Meu PC" -Install`,
        ].join('\n');
      }
      return [
        '# instala como serviço de auto-início:',
        '# intervalo é obtido automaticamente das configurações do servidor',
        `./lan-monitor.sh --server ${this.origin} --name "Meu PC" --install`,
      ].join('\n');
    },
    installHint() {
      if (this.os === 'windows') {
        return 'Cria a tarefa <span class="font-mono">SpeedMonitor-LanMonitor</span>, que roda em janela oculta e é reiniciada pelo Windows se o processo cair.';
      }
      if (this.os === 'macos') {
        return 'Cria um <span class="font-mono">LaunchAgent</span> que inicia no login e é mantido vivo pelo <span class="font-mono">launchd</span>.';
      }
      return 'Cria um serviço <span class="font-mono">systemd --user</span> (<span class="font-mono">lan-monitor.service</span>) com <span class="font-mono">Restart=always</span>. Se pedir, rode <span class="font-mono">sudo loginctl enable-linger $USER</span> uma vez para que ele rode mesmo sem sessão aberta.';
    },
    loopCmd() {
      if (this.os === 'windows') {
        return [
          '# roda em loop em background (janela oculta), com o intervalo das configurações do servidor:',
          `powershell -ExecutionPolicy Bypass -WindowStyle Hidden -File .\\lan-monitor.ps1 \``,
          `  -Server ${this.origin} -Name "Meu PC"`,
        ].join('\n');
      }
      return [
        '# roda em loop em background, com o intervalo das configurações do servidor:',
        `nohup ./lan-monitor.sh --server ${this.origin} --name "Meu PC" \\`,
        '  > /tmp/lan-monitor.log 2>&1 &',
      ].join('\n');
    },
    uninstallCmd() {
      if (this.os === 'windows') {
        return `powershell -ExecutionPolicy Bypass -File .\\lan-monitor.ps1 -Uninstall`;
      }
      return `./lan-monitor.sh --uninstall`;
    },
  },
};
</script>
