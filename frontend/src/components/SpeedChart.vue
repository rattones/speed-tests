<template>
  <div class="bg-gray-800 rounded-xl p-6">

    <!-- Header -->
    <div class="flex flex-col gap-3 mb-4">

      <!-- Linha 1: título + botão de filtro / limpar -->
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-semibold text-gray-300">Histórico de Velocidade</h2>

        <button
          v-if="mode === 'search'"
          @click="$emit('clear-search')"
          class="flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors"
        >
          <span>✕</span> Limpar filtro
        </button>

        <button
          v-else
          @click="showFilter = !showFilter"
          class="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 transition-colors"
        >
          Filtrar por data
          <span class="text-xs">{{ showFilter ? '▲' : '▼' }}</span>
        </button>
      </div>

      <!-- Painel de filtro por datas (somente live mode) -->
      <div
        v-if="showFilter && mode === 'live'"
        class="flex items-end gap-3 flex-wrap bg-gray-750 rounded-lg p-3 border border-gray-700"
      >
        <div>
          <label class="block text-xs text-gray-400 mb-1">De</label>
          <input
            v-model="filterFrom"
            type="date"
            :max="filterTo || today"
            :min="minFilterFrom"
            class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label class="block text-xs text-gray-400 mb-1">Até</label>
          <input
            v-model="filterTo"
            type="date"
            :max="today"
            class="bg-gray-700 border border-gray-600 rounded px-2 py-1 text-sm text-white focus:outline-none focus:border-blue-500"
          />
        </div>
        <div class="flex items-end gap-2">
          <button
            @click="onSearch"
            :disabled="!filterValid"
            class="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors font-medium"
          >
            Buscar
          </button>
          <span v-if="filterRangeError" class="text-xs text-red-400">{{ filterRangeError }}</span>
        </div>
      </div>

      <!-- Linha 2: navegação (live) ou label do período (search) -->
      <div class="flex items-center gap-2">

        <!-- Seta esquerda — recuar 12h -->
        <button
          v-if="mode === 'live'"
          @click="$emit('navigate', 'back')"
          :disabled="!canGoBack"
          title="Recuar 12h"
          class="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
        >
          ‹
        </button>

        <!-- Rótulo do período -->
        <span class="text-sm text-gray-400 font-mono tabular-nums">
          <template v-if="mode === 'search'">
            <span class="text-yellow-400 text-xs mr-1">filtrado</span>
          </template>
          {{ windowLabel }}
        </span>

        <!-- Seta direita — avançar 12h -->
        <button
          v-if="mode === 'live'"
          @click="$emit('navigate', 'forward')"
          :disabled="!canGoForward"
          title="Avançar 12h"
          class="w-7 h-7 flex items-center justify-center rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-30 disabled:cursor-not-allowed transition text-sm font-bold"
        >
          ›
        </button>

      </div>
    </div>

    <!-- Sem dados -->
    <div
      v-if="!wan1Tests.length && !wan2Tests.length"
      class="flex items-center justify-center h-64 text-gray-500"
    >
      Nenhum dado disponível no período
    </div>

    <!-- Gráfico -->
    <vue-apex-charts
      v-else
      type="line"
      height="350"
      :options="chartOptions"
      :series="series"
    />

  </div>
</template>

<script>
export default {
  name: 'SpeedChart',

  emits: ['navigate', 'search', 'clear-search'],

  props: {
    wan1Tests:    { type: Array,   required: true },
    wan2Tests:    { type: Array,   required: true },
    wan1Name:     { type: String,  default: 'WAN 1' },
    wan2Name:     { type: String,  default: 'WAN 2' },
    mode:         { type: String,  default: 'live' },   // 'live' | 'search'
    windowStart:  { type: Number,  default: null },     // timestamp ms
    windowEnd:    { type: Number,  default: null },     // timestamp ms
    canGoBack:    { type: Boolean, default: false },
    canGoForward: { type: Boolean, default: false },
  },

  data() {
    return {
      showFilter: false,
      filterFrom: '',
      filterTo:   '',
    };
  },

  watch: {
    mode(newMode) {
      if (newMode === 'live') this.showFilter = false;
    },
  },

  computed: {
    today() {
      return new Date().toISOString().slice(0, 10);
    },

    minFilterFrom() {
      if (!this.filterTo) return '';
      const d = new Date(this.filterTo + 'T00:00:00');
      d.setDate(d.getDate() - 15);
      return d.toISOString().slice(0, 10);
    },

    filterRangeDays() {
      if (!this.filterFrom || !this.filterTo) return 0;
      const diff = new Date(this.filterTo + 'T00:00:00') - new Date(this.filterFrom + 'T00:00:00');
      return diff / (1000 * 60 * 60 * 24);
    },

    filterRangeError() {
      if (!this.filterFrom || !this.filterTo) return '';
      if (new Date(this.filterFrom + 'T00:00:00') > new Date(this.filterTo + 'T00:00:00')) {
        return 'Data inicial maior que final';
      }
      if (this.filterRangeDays > 15) return 'Período máximo: 15 dias';
      return '';
    },

    filterValid() {
      return (
        this.filterFrom &&
        this.filterTo &&
        !this.filterRangeError
      );
    },

    windowLabel() {
      const fmt = (ts) => {
        if (!ts) return '?';
        return new Date(ts).toLocaleString('pt-BR', {
          day:    '2-digit',
          month:  '2-digit',
          hour:   '2-digit',
          minute: '2-digit',
        });
      };
      return `${fmt(this.windowStart)} – ${fmt(this.windowEnd)}`;
    },

    series() {
      const mapMbps = (tests, key) =>
        tests.map((t) => ({
          x: new Date(t.created_at.replace(' ', 'T')).getTime(),
          y: parseFloat(t[key].toFixed(2)),
        }));
      const mapMs = (tests) =>
        tests.map((t) => ({
          x: new Date(t.created_at.replace(' ', 'T')).getTime(),
          y: parseFloat(t.ping_ms.toFixed(1)),
        }));

      return [
        { name: `${this.wan1Name} - Download`, data: mapMbps(this.wan1Tests, 'download_mbps') },
        { name: `${this.wan1Name} - Upload`,   data: mapMbps(this.wan1Tests, 'upload_mbps') },
        { name: `${this.wan1Name} - Ping`,     data: mapMs(this.wan1Tests) },
        { name: `${this.wan2Name} - Download`, data: mapMbps(this.wan2Tests, 'download_mbps') },
        { name: `${this.wan2Name} - Upload`,   data: mapMbps(this.wan2Tests, 'upload_mbps') },
        { name: `${this.wan2Name} - Ping`,     data: mapMs(this.wan2Tests) },
      ];
    },

    chartOptions() {
      const wan1Download = `${this.wan1Name} - Download`;
      const wan1Ping     = `${this.wan1Name} - Ping`;

      return {
        chart: {
          background:  'transparent',
          toolbar:     { show: false },
          animations:  { enabled: true, speed: 400 },
        },
        theme:  { mode: 'dark' },
        colors: ['#3B82F6', '#93C5FD', '#BFDBFE', '#F59E0B', '#FCD34D', '#FDE68A'],
        stroke: {
          curve:     'smooth',
          width:     [2, 2, 2, 2, 2, 2],
          dashArray: [0, 5, 2, 0, 5, 2],
        },
        xaxis: {
          type: 'datetime',
          // Em live mode fixa a janela de 24h; em search deixa auto-escalar
          min: this.mode === 'live' && this.windowStart ? this.windowStart : undefined,
          max: this.mode === 'live' && this.windowEnd   ? this.windowEnd   : undefined,
          labels: { style: { colors: '#9CA3AF' }, datetimeUTC: false },
        },
        yaxis: [
          {
            seriesName: wan1Download,
            min: 0,
            labels: {
              style:     { colors: '#9CA3AF' },
              formatter: (v) => `${v.toFixed(1)} Mbps`,
            },
          },
          { seriesName: wan1Download, show: false },
          {
            seriesName: wan1Ping,
            opposite:   true,
            min:        0,
            labels: {
              style:     { colors: '#9CA3AF' },
              formatter: (v) => `${v.toFixed(0)} ms`,
            },
          },
          { seriesName: wan1Download, show: false },
          { seriesName: wan1Download, show: false },
          { seriesName: wan1Ping,     show: false },
        ],
        tooltip: {
          x: { format: 'dd/MM HH:mm' },
          y: {
            formatter: (val, { seriesIndex }) =>
              seriesIndex === 2 || seriesIndex === 5
                ? `${val.toFixed(0)} ms`
                : `${val.toFixed(1)} Mbps`,
          },
          theme: 'dark',
        },
        grid: {
          borderColor:    '#374151',
          strokeDashArray: 4,
        },
        legend: {
          position: 'top',
          labels:   { colors: '#D1D5DB' },
        },
        markers: { size: 0 },
      };
    },
  },

  methods: {
    onSearch() {
      if (!this.filterValid) return;
      this.$emit('search', { from: this.filterFrom, to: this.filterTo });
    },
  },
};
</script>
