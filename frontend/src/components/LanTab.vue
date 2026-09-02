<template>
  <div class="space-y-8">

    <!-- Barra de ações da rede local -->
    <section class="bg-gray-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-lg font-semibold text-gray-300">Rede Local</h2>
        <p class="text-xs text-gray-500">
          Velocidade e latência entre cada computador e este servidor, por toda a rota (WiFi ou cabo).
        </p>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button
          @click="runBrowserTest"
          :disabled="browserTest.running"
          class="flex items-center gap-2 px-3 py-1.5 text-sm rounded font-medium transition-colors"
          :class="browserTest.running
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-500 text-white'"
        >
          <span
            v-if="browserTest.running"
            class="animate-spin inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full"
          ></span>
          {{ browserTest.running ? phaseLabel : 'Testar deste computador' }}
        </button>
        <button
          @click="showHelp = true"
          class="px-3 py-1.5 text-sm rounded font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
        >Monitorar um computador</button>
      </div>
    </section>

    <!-- Resultado efêmero do teste pelo navegador -->
    <section
      v-if="browserTest.running || browserTest.result || browserTest.error"
      class="bg-gray-800 rounded-xl p-6 border-l-4 border-blue-500"
    >
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-sm font-semibold text-gray-300">
          Teste deste computador
          <span class="text-gray-500 font-normal">— não salvo, só exibição</span>
        </h3>
        <button
          v-if="!browserTest.running"
          @click="clearBrowserTest"
          class="text-gray-400 hover:text-white text-sm"
        >✕</button>
      </div>

      <div v-if="browserTest.error" class="text-red-400 text-sm">{{ browserTest.error }}</div>

      <div v-else class="grid grid-cols-3 gap-6">
        <div>
          <p class="text-gray-400 text-sm mb-1">↓ Download</p>
          <p class="text-2xl font-mono font-semibold text-white">
            {{ fmt(liveOrFinal('download_mbps')) }}
            <span class="text-sm font-normal text-gray-400">Mbps</span>
          </p>
        </div>
        <div>
          <p class="text-gray-400 text-sm mb-1">↑ Upload</p>
          <p class="text-2xl font-mono font-semibold text-white">
            {{ fmt(liveOrFinal('upload_mbps')) }}
            <span class="text-sm font-normal text-gray-400">Mbps</span>
          </p>
        </div>
        <div>
          <p class="text-gray-400 text-sm mb-1">⏱ Ping</p>
          <p class="text-xl font-mono font-semibold text-gray-200">
            {{ browserTest.result ? browserTest.result.ping_ms.toFixed(0) : '—' }}
            <span class="text-sm font-normal text-gray-400">ms</span>
            <span v-if="browserTest.result" class="text-xs text-gray-500 ml-1">
              ± {{ browserTest.result.jitter_ms.toFixed(1) }}
            </span>
          </p>
        </div>
      </div>
    </section>

    <!-- Cards de Status -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-300">Dispositivos</h2>
        <div v-if="devices.length > maxVisibleCards" class="flex items-center gap-2">
          <button
            @click="cardOffset--"
            :disabled="cardOffset <= 0"
            title="Anterior"
            class="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
          >‹</button>
          <button
            @click="cardOffset++"
            :disabled="cardOffset >= devices.length - maxVisibleCards"
            title="Próxima"
            class="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
          >›</button>
        </div>
      </div>

      <div
        v-if="!devices.length"
        class="bg-gray-800 rounded-xl p-8 text-center text-gray-500 text-sm"
      >
        Nenhum dispositivo monitorado ainda. Clique em <strong class="text-gray-300">"Monitorar um computador"</strong>
        para baixar o agente e começar.
      </div>

      <div
        v-else
        class="grid gap-6"
        :style="{ gridTemplateColumns: `repeat(${visibleDevices.length}, minmax(0, 1fr))` }"
      >
        <wan-card
          v-for="d in visibleDevices"
          :key="d.id"
          :wan-name="d.name"
          :wan-key="d.id"
          :order-number="d.sortOrder"
          :color="d.color"
          :latest-test="latestByDevice[d.id] || null"
          :min-download="d.minDownload"
          :min-upload="d.minUpload"
          :max-ping="d.maxPing"
          :measuring="false"
          :can-run-test="false"
          :subtitle="deviceSubtitle(d)"
          :visible="deviceVisibility[d.id] !== false"
          @toggle-visible="toggleDeviceVisible"
        />
      </div>
    </section>

    <!-- Gráfico de Histórico -->
    <section>
      <speed-chart
        :wans="chartDevices"
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

    <lan-help-modal v-if="showHelp" @close="showHelp = false" />

  </div>
</template>

<script>
const { loadModule, options, defineAsyncComponent } = window.__SFC__;
const { runLanTest } = window.__LAN_MEASURE__;

const PHASE_LABELS = {
  ping:     'Medindo latência...',
  download: 'Testando download...',
  upload:   'Testando upload...',
  done:     'Concluído',
};

export default {
  name: 'LanTab',

  components: {
    WanCard:      defineAsyncComponent(() => loadModule('/src/components/WanCard.vue', options)),
    SpeedChart:   defineAsyncComponent(() => loadModule('/src/components/SpeedChart.vue', options)),
    LanHelpModal: defineAsyncComponent(() => loadModule('/src/components/LanHelpModal.vue', options)),
  },

  props: {
    reloadKey: { type: Number, default: 0 },
  },

  emits: ['loaded'],

  data() {
    return {
      allTests:        [],
      devices:         [],
      loading:         true,
      deviceVisibility: {},
      maxVisibleCards: 3,
      cardOffset:      0,
      mode:            'live',
      windowEnd:       new Date(),
      windowEndIsNow:  true,
      searchFrom:      '',
      searchTo:        '',
      refreshTimer:    null,
      showHelp:        false,
      browserTest: {
        running:    false,
        phase:      null,
        liveMbps:   { download: null, upload: null },
        result:     null,
        error:      '',
      },
    };
  },

  computed: {
    phaseLabel() {
      return PHASE_LABELS[this.browserTest.phase] || 'Testando...';
    },
    windowStart() {
      return new Date(this.windowEnd.getTime() - 24 * 60 * 60 * 1000);
    },
    displayWindowStart() {
      if (this.mode === 'search' && this.searchFrom) return new Date(this.searchFrom + 'T00:00:00');
      return this.windowStart;
    },
    displayWindowEnd() {
      if (this.mode === 'search' && this.searchTo) return new Date(this.searchTo + 'T23:59:59');
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
    testsByDevice() {
      const map = {};
      for (const d of this.devices) map[d.id] = [];
      for (const t of this.visibleTests) {
        if (t.device_id != null && map[t.device_id]) map[t.device_id].push(t);
      }
      return map;
    },
    latestByDevice() {
      const map = {};
      for (const d of this.devices) {
        const arr = this.testsByDevice[d.id] || [];
        map[d.id] = arr.length ? arr[arr.length - 1] : null;
      }
      return map;
    },
    visibleDevices() {
      if (this.devices.length <= this.maxVisibleCards) return this.devices;
      return this.devices.slice(this.cardOffset, this.cardOffset + this.maxVisibleCards);
    },
    chartDevices() {
      return this.devices
        .filter((d) => this.deviceVisibility[d.id] !== false)
        .map((d) => ({
          id:    d.id,
          name:  d.name,
          color: d.color,
          tests: this.testsByDevice[d.id] || [],
        }));
    },
    canGoBack() {
      if (this.mode !== 'live') return false;
      if (!this.allTests.length) return false;
      const earliest       = new Date(this.allTests[0].created_at.replace(' ', 'T')).getTime();
      const newWindowStart = this.windowEnd.getTime() - 36 * 60 * 60 * 1000;
      return newWindowStart >= earliest;
    },
    canGoForward() {
      if (this.mode !== 'live') return false;
      return this.windowEnd.getTime() < Date.now() - 10 * 60 * 1000;
    },
  },

  watch: {
    devices(newDevices) {
      const maxOffset = Math.max(0, newDevices.length - this.maxVisibleCards);
      if (this.cardOffset > maxOffset) this.cardOffset = maxOffset;
    },
    reloadKey() {
      this.refreshAll();
    },
  },

  async mounted() {
    await this.fetchDevices();
    await this.fetchData();
    this.refreshTimer = setInterval(() => {
      if (this.mode === 'live') this.fetchData();
    }, 60_000);
  },

  beforeUnmount() {
    clearInterval(this.refreshTimer);
  },

  methods: {
    fmt(v) {
      return v == null ? '—' : Number(v).toFixed(1);
    },
    liveOrFinal(key) {
      if (this.browserTest.result) return this.browserTest.result[key];
      const phase = key === 'download_mbps' ? 'download' : 'upload';
      return this.browserTest.liveMbps[phase];
    },

    deviceSubtitle(d) {
      const parts = [];
      if (d.connType && d.connType !== 'unknown') {
        parts.push(d.connType === 'wifi' ? 'WiFi' : 'Cabo');
      }
      if (d.os) parts.push(d.os);
      if (d.lastSeenAt) parts.push('visto ' + this.timeAgo(d.lastSeenAt));
      return parts.join(' · ');
    },

    timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000);
      if (diff < 60)   return `há ${diff}s`;
      if (diff < 3600) return `há ${Math.floor(diff / 60)}min`;
      if (diff < 86400) return `há ${Math.floor(diff / 3600)}h`;
      return `há ${Math.floor(diff / 86400)}d`;
    },

    async refreshAll() {
      await this.fetchDevices();
      await this.fetchData();
    },

    async fetchDevices() {
      try {
        const res = await fetch('/api/lan/devices');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.devices = json.data.map((d) => ({
          ...d,
          color: d.colorHex,
        }));
      } catch (err) {
        console.error('[LanTab] Erro ao carregar dispositivos:', err);
      }
    },

    async fetchData() {
      this.loading = true;
      try {
        const res = await fetch('/api/lan/tests?days=15');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.allTests = json.data;
        if (this.windowEndIsNow) this.windowEnd = new Date();
        this.$emit('loaded');
      } catch (err) {
        console.error('[LanTab] Erro ao carregar testes:', err);
      } finally {
        this.loading = false;
      }
    },

    async applySearch({ from, to }) {
      this.loading = true;
      try {
        const params = new URLSearchParams({ from: `${from} 00:00:00`, to: `${to} 23:59:59` });
        const res = await fetch(`/api/lan/tests?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.allTests   = json.data;
        this.searchFrom = from;
        this.searchTo   = to;
        this.mode       = 'search';
      } catch (err) {
        console.error('[LanTab] Erro na busca:', err);
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

    toggleDeviceVisible(deviceId) {
      const current = this.deviceVisibility[deviceId] !== false;
      this.deviceVisibility = { ...this.deviceVisibility, [deviceId]: !current };
    },

    async runBrowserTest() {
      this.browserTest = {
        running: true,
        phase: 'ping',
        liveMbps: { download: null, upload: null },
        result: null,
        error: '',
      };
      try {
        const result = await runLanTest({
          onPhase: (name) => { this.browserTest.phase = name; },
          onProgress: (name, mbps) => {
            this.browserTest.liveMbps = { ...this.browserTest.liveMbps, [name]: mbps };
          },
        });
        this.browserTest.result = result;
      } catch (err) {
        this.browserTest.error = 'Falha no teste: ' + (err.message || err);
      } finally {
        this.browserTest.running = false;
      }
    },

    clearBrowserTest() {
      this.browserTest = {
        running: false, phase: null,
        liveMbps: { download: null, upload: null },
        result: null, error: '',
      };
    },
  },
};
</script>
