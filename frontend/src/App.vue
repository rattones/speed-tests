<template>
  <div class="bg-gray-900 text-white h-screen overflow-hidden flex flex-col">

    <!-- Header -->
    <header class="bg-gray-800 border-b border-gray-700 flex-shrink-0" style="padding: clamp(0.4rem, 1.2vh, 1rem) clamp(0.75rem, 2vw, 1.5rem);">
      <div class="max-w-7xl mx-auto flex items-center justify-between gap-4">
        <div>
          <h1 class="font-bold text-white" style="font-size: clamp(1.1rem, 2.2vh, 1.5rem);">⚡ Speed Monitor</h1>
          <p class="text-gray-400" style="font-size: clamp(0.65rem, 1.3vh, 0.875rem);">Monitoramento de rede</p>
        </div>
        <div class="flex items-center gap-4">
          <!-- Abas -->
          <div class="flex gap-1">
            <button
              v-for="tab in tabs"
              :key="tab.key"
              @click="activeTab = tab.key"
              class="font-medium rounded-lg transition-colors"
              style="padding: clamp(0.3rem, 0.9vh, 0.5rem) clamp(0.6rem, 1.2vw, 1rem); font-size: clamp(0.75rem, 1.3vh, 0.875rem);"
              :class="activeTab === tab.key
                ? 'text-white bg-gray-700'
                : 'text-gray-400 hover:text-gray-200'"
            >{{ tab.label }}</button>
          </div>

          <div class="text-right text-gray-400" style="font-size: clamp(0.7rem, 1.3vh, 0.875rem);">
            <div v-if="lastUpdate">
              Atualizado: {{ timeAgo(lastUpdate) }}
            </div>
          </div>
          <button
            @click="showConfig = true"
            class="rounded-full hover:bg-gray-700 transition-colors"
            style="padding: clamp(0.3rem, 0.8vh, 0.5rem); font-size: clamp(1rem, 1.8vh, 1.25rem);"
            title="Configurações"
          >⚙️</button>
        </div>
      </div>
    </header>

    <main class="max-w-7xl mx-auto w-full flex-1 min-h-0" style="padding: clamp(0.5rem, 1.5vh, 1.5rem) clamp(0.75rem, 2vw, 1.5rem);">
      <wan-tab
        v-show="activeTab === 'wans'"
        class="h-full"
        :reload-key="reloadKey"
        @loaded="onLoaded"
      />
      <lan-tab
        v-show="activeTab === 'lan'"
        class="h-full"
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
    <footer class="border-t border-gray-700 flex-shrink-0" style="padding: clamp(0.35rem, 1vh, 1rem) clamp(0.75rem, 2vw, 1.5rem);">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 sm:gap-4">
        <p class="text-gray-500" style="font-size: clamp(0.65rem, 1.2vh, 0.875rem);">
          Intervalo de coleta das WANs: <span class="text-gray-300 font-mono">{{ config.cronInterval }}</span>
        </p>
        <div class="text-gray-500 text-right" style="font-size: clamp(0.65rem, 1.2vh, 0.875rem);">
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
