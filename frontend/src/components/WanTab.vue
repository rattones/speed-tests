<template>
  <div class="space-y-8">

    <!-- Cards de Status -->
    <section>
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-semibold text-gray-300">Status Atual</h2>
        <div v-if="wans.length > maxVisibleCards" class="flex items-center gap-2">
          <button
            @click="cardOffset--"
            :disabled="cardOffset <= 0"
            title="Anterior"
            class="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
          >‹</button>
          <button
            @click="cardOffset++"
            :disabled="cardOffset >= wans.length - maxVisibleCards"
            title="Próxima"
            class="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
          >›</button>
        </div>
      </div>
      <div class="grid gap-6" :style="{ gridTemplateColumns: `repeat(${visibleWans.length}, minmax(0, 1fr))` }">
        <wan-card
          v-for="w in visibleWans"
          :key="w.id"
          :wan-name="w.name"
          :wan-key="w.id"
          :order-number="w.sortOrder"
          :color="w.color"
          :latest-test="latestByWan[w.id] || null"
          :min-download="w.minDownload"
          :min-upload="w.minUpload"
          :max-ping="w.maxPing"
          :measuring="!!measuringByWan[w.id]"
          :visible="wanVisibility[w.id] !== false"
          @run-test="runTest"
          @toggle-visible="toggleWanVisible"
        />
      </div>
    </section>

    <!-- Gráfico de Histórico -->
    <section>
      <speed-chart
        :wans="chartWans"
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

  </div>
</template>

<script>
const { loadModule, options, defineAsyncComponent } = window.__SFC__;

export default {
  name: 'WanTab',

  components: {
    WanCard:    defineAsyncComponent(() => loadModule('/src/components/WanCard.vue', options)),
    SpeedChart: defineAsyncComponent(() => loadModule('/src/components/SpeedChart.vue', options)),
  },

  props: {
    // Estado compartilhado com o App para o footer e o painel de config
    reloadKey: { type: Number, default: 0 },
  },

  emits: ['loaded'],

  data() {
    return {
      allTests:       [],
      wans:           [],
      loading:        true,
      measuringByWan: {},
      wanVisibility:  {},
      maxVisibleCards: 3,
      cardOffset:     0,
      mode:           'live',
      windowEnd:      new Date(),
      windowEndIsNow: true,
      searchFrom:     '',
      searchTo:       '',
      refreshTimer:   null,
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
    testsByWan() {
      const map = {};
      for (const w of this.wans) map[w.id] = [];
      for (const t of this.visibleTests) {
        if (t.wan_id != null && map[t.wan_id]) map[t.wan_id].push(t);
      }
      return map;
    },
    latestByWan() {
      const map = {};
      for (const w of this.wans) {
        const arr = this.testsByWan[w.id] || [];
        map[w.id] = arr.length ? arr[arr.length - 1] : null;
      }
      return map;
    },
    visibleWans() {
      if (this.wans.length <= this.maxVisibleCards) return this.wans;
      return this.wans.slice(this.cardOffset, this.cardOffset + this.maxVisibleCards);
    },
    chartWans() {
      return this.wans
        .filter((w) => this.wanVisibility[w.id] !== false)
        .map((w) => ({
          id:    w.id,
          name:  w.name,
          color: w.color,
          tests: this.testsByWan[w.id] || [],
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
    wans(newWans) {
      const maxOffset = Math.max(0, newWans.length - this.maxVisibleCards);
      if (this.cardOffset > maxOffset) this.cardOffset = maxOffset;
    },
    reloadKey() {
      this.refreshAll();
    },
  },

  async mounted() {
    await this.fetchWans();
    await this.fetchData();
    this.refreshTimer = setInterval(() => {
      if (this.mode === 'live') this.fetchData();
    }, 60_000);
  },

  beforeUnmount() {
    clearInterval(this.refreshTimer);
  },

  methods: {
    async refreshAll() {
      await this.fetchWans();
      await this.fetchData();
    },

    async fetchWans() {
      try {
        const res = await fetch('/api/config/wans');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.wans = json.data.map((w) => ({
          id:          w.id,
          name:        w.name,
          serverId:    w.serverId,
          color:       w.colorHex,
          colorHex:    w.colorHex,
          minDownload: w.minDownload,
          minUpload:   w.minUpload,
          maxPing:     w.maxPing,
          sortOrder:   w.sortOrder,
        }));
      } catch (err) {
        console.error('[WanTab] Erro ao carregar WANs:', err);
      }
    },

    async fetchData() {
      this.loading = true;
      try {
        const res = await fetch('/api/tests?days=15');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.allTests = json.data;
        if (this.windowEndIsNow) this.windowEnd = new Date();
        this.$emit('loaded');
      } catch (err) {
        console.error('[WanTab] Erro ao carregar testes:', err);
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
      } catch (err) {
        console.error('[WanTab] Erro na busca:', err);
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

    toggleWanVisible(wanId) {
      const current = this.wanVisibility[wanId] !== false;
      this.wanVisibility = { ...this.wanVisibility, [wanId]: !current };
    },

    async runTest(wanId) {
      this.measuringByWan = { ...this.measuringByWan, [wanId]: true };
      try {
        const res = await fetch('/api/tests/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wanId }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.error('[WanTab] Erro ao executar teste manual:', err.error || res.status);
        }
      } catch (err) {
        console.error('[WanTab] Erro ao executar teste manual:', err);
      } finally {
        this.measuringByWan = { ...this.measuringByWan, [wanId]: false };
        await this.fetchData();
      }
    },
  },
};
</script>
