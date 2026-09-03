<template>
  <div class="h-full flex flex-col" style="gap: clamp(0.5rem, 1.5vh, 2rem);">

    <!-- Cards de Status -->
    <section class="flex-shrink-0">
      <div class="flex items-center justify-between" style="margin-bottom: clamp(0.4rem, 1vh, 1rem);">
        <h2 class="font-semibold text-gray-300" style="font-size: clamp(0.9rem, 1.6vh, 1.125rem);">Dispositivos</h2>
        <div class="flex items-center gap-2">
          <button
            @click="runBrowserTest"
            :disabled="browserTest.running"
            class="flex items-center gap-2 rounded font-medium transition-colors"
            style="padding: clamp(0.25rem, 0.7vh, 0.375rem) clamp(0.5rem, 1vw, 0.75rem); font-size: clamp(0.75rem, 1.3vh, 0.875rem);"
            :class="browserTest.running
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-500 text-white'"
          >
            <span
              v-if="browserTest.running"
              class="animate-spin inline-block w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full"
            ></span>
            {{ browserTest.running ? 'Testando...' : 'Testar deste computador' }}
          </button>
          <button
            @click="showHelp = true"
            class="rounded font-medium bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
            style="padding: clamp(0.25rem, 0.7vh, 0.375rem) clamp(0.5rem, 1vw, 0.75rem); font-size: clamp(0.75rem, 1.3vh, 0.875rem);"
          >Monitorar um computador</button>

          <template v-if="devices.length > maxVisibleCards">
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
          </template>
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
        class="grid gap-4"
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
    <section class="flex-1 min-h-0">
      <speed-chart
        class="h-full"
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

    <lan-test-result-modal
      v-if="showTestResult"
      :test="browserTest"
      @close="showTestResult = false"
    />

    <lan-help-modal v-if="showHelp" @close="showHelp = false" />

  </div>
</template>

<script>
const { loadModule, options, defineAsyncComponent } = window.__SFC__;
const { runLanTest } = window.__LAN_MEASURE__;

export default {
  name: 'LanTab',

  components: {
    WanCard:            defineAsyncComponent(() => loadModule('/src/components/WanCard.vue', options)),
    SpeedChart:         defineAsyncComponent(() => loadModule('/src/components/SpeedChart.vue', options)),
    LanHelpModal:       defineAsyncComponent(() => loadModule('/src/components/LanHelpModal.vue', options)),
    LanTestResultModal: defineAsyncComponent(() => loadModule('/src/components/LanTestResultModal.vue', options)),
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
      showTestResult:  false,
      browserTest: {
        running:  false,
        phase:    null,
        liveMbps: { download: null, upload: null },
        result:   null,
        error:    '',
      },
    };
  },

  computed: {
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
        running:  true,
        phase:    'ping',
        liveMbps: { download: null, upload: null },
        result:   null,
        error:    '',
      };
      this.showTestResult = true;
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
  },
};
</script>
