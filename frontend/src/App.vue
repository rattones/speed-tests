<template>
  <div class="bg-gray-900 min-h-screen text-white">

    <!-- Header -->
    <header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">⚡ Speed Monitor</h1>
          <p class="text-sm text-gray-400 mt-0.5">Monitoramento de Links WAN</p>
        </div>
        <div class="text-right text-sm text-gray-400">
          <div v-if="lastUpdate">
            Atualizado: {{ timeAgo(lastUpdate) }}
          </div>
          <div v-if="loading" class="flex items-center gap-1 text-blue-400">
            <span class="animate-pulse">●</span> Carregando...
          </div>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-8 space-y-8">

      <!-- Cards de Status -->
      <section>
        <h2 class="text-lg font-semibold text-gray-300 mb-4">Status Atual</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <wan-card
            :wan-name="config.wan1Name"
            :latest-test="wan1Latest"
            :min-download="config.wan1MinDownload"
            :min-upload="config.wan1MinUpload"
          />
          <wan-card
            :wan-name="config.wan2Name"
            :latest-test="wan2Latest"
            :min-download="config.wan2MinDownload"
            :min-upload="config.wan2MinUpload"
          />
        </div>
      </section>

      <!-- Gráfico de Histórico -->
      <section>
        <speed-chart
          :wan1-tests="wan1Tests"
          :wan2-tests="wan2Tests"
          :wan1-name="config.wan1Name"
          :wan2-name="config.wan2Name"
        />
      </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-700 px-6 py-4 mt-8">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-sm text-gray-500">
          Intervalo de coleta: <span class="text-gray-300 font-mono">{{ config.cronInterval }}</span>
        </p>
        <alert-button :vapid-public-key="config.vapidPublicKey" />
      </div>
    </footer>

  </div>
</template>

<script>
// loadModule e defineAsyncComponent são expostos pelo main.js via window.__SFC__
// SFCs carregados pelo vue3-sfc-loader não têm acesso a imports de módulo externos
const { loadModule, options, defineAsyncComponent } = window.__SFC__;

export default {
  name: 'App',

  components: {
    WanCard:     defineAsyncComponent(() => loadModule('/src/components/WanCard.vue', options)),
    SpeedChart:  defineAsyncComponent(() => loadModule('/src/components/SpeedChart.vue', options)),
    AlertButton: defineAsyncComponent(() => loadModule('/src/components/AlertButton.vue', options)),
  },

  data() {
    return {
      tests:      [],
      loading:    true,
      lastUpdate: null,
      config: {
        wan1Name:        'WAN_1',
        wan2Name:        'WAN_2',
        wan1MinDownload: 0,
        wan1MinUpload:   0,
        wan2MinDownload: 0,
        wan2MinUpload:   0,
        cronInterval:    '*/15 * * * *',
        vapidPublicKey:  '',
      },
    };
  },

  computed: {
    wan1Tests() {
      return this.tests.filter((t) => t.interface_name === this.config.wan1Name);
    },
    wan2Tests() {
      return this.tests.filter((t) => t.interface_name === this.config.wan2Name);
    },
    wan1Latest() {
      return this.wan1Tests.length ? this.wan1Tests[this.wan1Tests.length - 1] : null;
    },
    wan2Latest() {
      return this.wan2Tests.length ? this.wan2Tests[this.wan2Tests.length - 1] : null;
    },
  },

  async mounted() {
    await this.fetchConfig();
    await this.fetchData();
    // Atualizar dados a cada 60 segundos
    setInterval(() => this.fetchData(), 60_000);
  },

  methods: {
    async fetchConfig() {
      try {
        const res = await fetch('/api/config');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.config = await res.json();
      } catch (err) {
        console.error('[App] Erro ao carregar config:', err);
      }
    },

    async fetchData() {
      this.loading = true;
      try {
        const res = await fetch('/api/tests?days=7');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.tests = json.data;
        this.lastUpdate = new Date().toISOString();
      } catch (err) {
        console.error('[App] Erro ao carregar testes:', err);
      } finally {
        this.loading = false;
      }
    },

    timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60)  return `há ${diff}s`;
      if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
      return `há ${Math.floor(diff / 3600)}h`;
    },
  },
};
</script>
