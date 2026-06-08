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
            wan-key="wan1"
            :latest-test="wan1Latest"
            :min-download="config.wan1MinDownload"
            :min-upload="config.wan1MinUpload"
            :measuring="wan1Measuring"
            @run-test="runTest"
          />
          <wan-card
            :wan-name="config.wan2Name"
            wan-key="wan2"
            :latest-test="wan2Latest"
            :min-download="config.wan2MinDownload"
            :min-upload="config.wan2MinUpload"
            :measuring="wan2Measuring"
            @run-test="runTest"
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
          :mode="mode"
          :window-start="displayWindowStart.getTime()"
          :window-end="displayWindowEnd.getTime()"
          :can-go-back="canGoBack"
          :can-go-forward="canGoForward"
          @navigate="onNavigate"
          @search="applySearch"
          @clear-search="clearSearch"
        />
      </section>

    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-700 px-6 py-4 mt-8">
      <div class="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p class="text-sm text-gray-500">
          Intervalo de coleta: <span class="text-gray-300 font-mono">{{ config.cronInterval }}</span>
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
    WanCard:    defineAsyncComponent(() => loadModule('/src/components/WanCard.vue', options)),
    SpeedChart: defineAsyncComponent(() => loadModule('/src/components/SpeedChart.vue', options)),
  },

  data() {
    return {
      allTests:       [],
      loading:        true,
      lastUpdate:     null,
      wan1Measuring:  false,
      wan2Measuring:  false,
      mode:           'live',     // 'live' | 'search'
      windowEnd:      new Date(), // live mode: borda direita da janela de 24h
      windowEndIsNow: true,       // se true, windowEnd acompanha "agora" no refresh
      searchFrom:     '',         // search mode: data inicial (YYYY-MM-DD)
      searchTo:       '',         // search mode: data final (YYYY-MM-DD)
      refreshTimer:   null,
      config: {
        wan1Name:        'WAN_1',
        wan2Name:        'WAN_2',
        wan1MinDownload: 0,
        wan1MinUpload:   0,
        wan2MinDownload: 0,
        wan2MinUpload:   0,
        cronInterval:    '*/15 * * * *',
      },
    };
  },

  computed: {
    windowStart() {
      return new Date(this.windowEnd.getTime() - 24 * 60 * 60 * 1000);
    },

    displayWindowStart() {
      if (this.mode === 'search' && this.searchFrom) {
        return new Date(this.searchFrom + 'T00:00:00');
      }
      return this.windowStart;
    },

    displayWindowEnd() {
      if (this.mode === 'search' && this.searchTo) {
        return new Date(this.searchTo + 'T23:59:59');
      }
      return this.windowEnd;
    },

    visibleTests() {
      if (this.mode === 'search') return this.allTests;
      const start = this.windowStart.getTime();
      const end   = this.windowEnd.getTime();
      return this.allTests.filter((t) => {
        const ts = new Date(t.created_at.replace(' ', 'T')).getTime();
        return ts >= start && ts <= end;
      });
    },

    wan1Tests() {
      return this.visibleTests.filter((t) => t.interface_name === this.config.wan1Name);
    },

    wan2Tests() {
      return this.visibleTests.filter((t) => t.interface_name === this.config.wan2Name);
    },

    wan1Latest() {
      return this.wan1Tests.length ? this.wan1Tests[this.wan1Tests.length - 1] : null;
    },

    wan2Latest() {
      return this.wan2Tests.length ? this.wan2Tests[this.wan2Tests.length - 1] : null;
    },

    canGoBack() {
      if (this.mode !== 'live') return false;
      if (!this.allTests.length) return false;
      const earliest      = new Date(this.allTests[0].created_at.replace(' ', 'T')).getTime();
      const newWindowStart = this.windowEnd.getTime() - 36 * 60 * 60 * 1000;
      return newWindowStart >= earliest;
    },

    canGoForward() {
      if (this.mode !== 'live') return false;
      return this.windowEnd.getTime() < Date.now() - 10 * 60 * 1000;
    },
  },

  async mounted() {
    await this.fetchConfig();
    await this.fetchData();
    this.refreshTimer = setInterval(() => {
      if (this.mode === 'live') this.fetchData();
    }, 60_000);
  },

  beforeUnmount() {
    clearInterval(this.refreshTimer);
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
        // Busca 15 dias para permitir navegação retroativa
        const res = await fetch('/api/tests?days=15');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.allTests = json.data;
        this.lastUpdate = new Date().toISOString();
        if (this.windowEndIsNow) this.windowEnd = new Date();
      } catch (err) {
        console.error('[App] Erro ao carregar testes:', err);
      } finally {
        this.loading = false;
      }
    },

    async applySearch({ from, to }) {
      this.loading = true;
      try {
        const params = new URLSearchParams({
          from: `${from} 00:00:00`,
          to:   `${to} 23:59:59`,
        });
        const res = await fetch(`/api/tests?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.allTests   = json.data;
        this.searchFrom = from;
        this.searchTo   = to;
        this.mode       = 'search';
        this.lastUpdate = new Date().toISOString();
      } catch (err) {
        console.error('[App] Erro na busca:', err);
      } finally {
        this.loading = false;
      }
    },

    clearSearch() {
      this.mode           = 'live';
      this.searchFrom     = '';
      this.searchTo       = '';
      this.windowEnd      = new Date();
      this.windowEndIsNow = true;
      this.fetchData();
    },

    onNavigate(direction) {
      const step = 12 * 60 * 60 * 1000;
      if (direction === 'back') {
        this.windowEnd      = new Date(this.windowEnd.getTime() - step);
        this.windowEndIsNow = false;
      } else {
        const candidate = new Date(this.windowEnd.getTime() + step);
        const now       = new Date();
        if (candidate >= now) {
          this.windowEnd      = now;
          this.windowEndIsNow = true;
        } else {
          this.windowEnd      = candidate;
          this.windowEndIsNow = false;
        }
      }
    },

    timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000);
      if (diff < 60)   return `há ${diff}s`;
      if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
      return `há ${Math.floor(diff / 3600)}h`;
    },

    async runTest(wanKey) {
      if (wanKey === 'wan1') this.wan1Measuring = true;
      else                   this.wan2Measuring = true;
      try {
        const res = await fetch('/api/tests/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wan: wanKey }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[App] Erro ao executar teste manual:', err.error || res.status);
        }
      } catch (err) {
        console.error('[App] Erro ao executar teste manual:', err);
      } finally {
        if (wanKey === 'wan1') this.wan1Measuring = false;
        else                   this.wan2Measuring = false;
        await this.fetchData();
      }
    },
  },
};
</script>
