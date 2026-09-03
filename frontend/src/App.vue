<template>
  <div class="bg-gray-900 min-h-screen text-white">

    <!-- Header -->
    <header class="bg-gray-800 border-b border-gray-700 px-6 py-4">
      <div class="max-w-7xl mx-auto flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">⚡ Speed Monitor</h1>
          <p class="text-sm text-gray-400 mt-0.5">Monitoramento de rede</p>
        </div>
        <div class="flex items-center gap-4">
          <div class="text-right text-sm text-gray-400">
            <div v-if="lastUpdate">
              Atualizado: {{ timeAgo(lastUpdate) }}
            </div>
          </div>
          <button
            @click="showConfig = true"
            class="p-2 rounded-full hover:bg-gray-700 transition-colors text-xl"
            title="Configurações"
          >⚙️</button>
        </div>
      </div>

      <!-- Abas -->
      <div class="max-w-7xl mx-auto mt-3 flex gap-1">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          @click="activeTab = tab.key"
          class="px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2"
          :class="activeTab === tab.key
            ? 'text-white border-blue-500 bg-gray-900'
            : 'text-gray-400 border-transparent hover:text-gray-200'"
        >{{ tab.label }}</button>
      </div>
    </header>

    <main class="max-w-7xl mx-auto px-6 py-8">
      <wan-tab
        v-show="activeTab === 'wans'"
        :reload-key="reloadKey"
        @loaded="onLoaded"
      />
      <lan-tab
        v-show="activeTab === 'lan'"
        :reload-key="reloadKey"
        @loaded="onLoaded"
      />
    </main>

    <config-panel
      v-if="showConfig"
      :cron-interval="config.cronInterval"
      :active-tab="activeTab"
      @close="showConfig = false"
      @changed="onConfigChanged"
    />

    <!-- Footer -->
    <footer class="border-t border-gray-700 px-6 py-4 mt-8">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-sm text-gray-500">
          Intervalo de coleta das WANs: <span class="text-gray-300 font-mono">{{ config.cronInterval }}</span>
        </p>
        <div class="text-sm text-gray-500 text-right">
          <p>Desenvolvido por: <span class="text-gray-300">Marcelo Ratton</span></p>
          <a
            href="https://github.com/rattones/speed-tests"
            target="_blank"
            rel="noopener noreferrer"
            class="text-blue-400 hover:text-blue-300 transition-colors"
          >github.com/rattones/speed-tests</a>
        </div>
      </div>
    </footer>

  </div>
</template>

<script>
const { loadModule, options, defineAsyncComponent } = window.__SFC__;

export default {
  name: 'App',

  components: {
    WanTab:      defineAsyncComponent(() => loadModule('/src/components/WanTab.vue', options)),
    LanTab:      defineAsyncComponent(() => loadModule('/src/components/LanTab.vue', options)),
    ConfigPanel: defineAsyncComponent(() => loadModule('/src/components/ConfigPanel.vue', options)),
  },

  data() {
    return {
      activeTab:  'wans',
      tabs: [
        { key: 'wans', label: 'WANs' },
        { key: 'lan',  label: 'Rede Local' },
      ],
      showConfig: false,
      lastUpdate: null,
      reloadKey:  0,
      config: {
        cronInterval: '*/15 * * * *',
      },
    };
  },

  async mounted() {
    await this.fetchConfig();
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

    onLoaded() {
      this.lastUpdate = new Date().toISOString();
    },

    async onConfigChanged() {
      await this.fetchConfig();
      this.reloadKey++;
    },

    timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000);
      if (diff < 60)   return `há ${diff}s`;
      if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
      return `há ${Math.floor(diff / 3600)}h`;
    },
  },
};
</script>
