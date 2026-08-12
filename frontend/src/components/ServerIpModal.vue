<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-[60]" @click.self="$emit('close')">
    <div class="bg-gray-800 rounded-xl shadow-lg w-full max-w-lg">

      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <h2 class="text-lg font-bold text-white">Configuração necessária no load balancer</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white text-xl leading-none">✕</button>
      </div>

      <div class="p-6 space-y-4 text-sm text-gray-300">
        <p>
          Para que o teste da WAN <strong class="text-white">{{ wanName }}</strong> seja isolado corretamente,
          adicione no load balancer uma <strong>rota estática</strong> direcionando o IP abaixo exclusivamente
          pela WAN que você deseja testar.
        </p>

        <div class="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <p class="text-xs text-gray-400 mb-1">Server ID</p>
          <p class="font-mono text-white mb-3">{{ serverId }}</p>

          <div v-if="loading" class="flex items-center gap-2 text-blue-400">
            <span class="animate-spin inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full"></span>
            Buscando IP do servidor (executa um teste real, ~30s)...
          </div>

          <div v-else-if="error" class="text-red-400">{{ error }}</div>

          <div v-else-if="ip">
            <p class="text-xs text-gray-400 mb-1">Servidor</p>
            <p class="text-white mb-3">{{ serverName }} <span class="text-gray-500">({{ serverHost }})</span></p>
            <p class="text-xs text-gray-400 mb-1">IP a ser roteado</p>
            <p class="font-mono text-2xl text-green-400">{{ ip }}</p>
          </div>
        </div>

        <p class="text-xs text-gray-500">
          Sem essa rota estática, o load balancer pode enviar o tráfego de teste por qualquer WAN,
          invalidando a medição isolada desse link.
        </p>
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
  name: 'ServerIpModal',

  emits: ['close'],

  props: {
    wanName:  { type: String, required: true },
    serverId: { type: [String, Number], required: true },
  },

  data() {
    return {
      loading:    true,
      error:      '',
      ip:         '',
      serverHost: '',
      serverName: '',
    };
  },

  async mounted() {
    try {
      const res = await fetch(`/api/config/wans/lookup-ip?serverId=${encodeURIComponent(this.serverId)}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      this.ip         = data.ip;
      this.serverHost = data.host;
      this.serverName = data.name;
    } catch (err) {
      this.error = err.message;
    } finally {
      this.loading = false;
    }
  },
};
</script>
