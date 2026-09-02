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
      v-if="wans.every((w) => !w.tests.length)"
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
const { deriveShades } = window.__COLOR_UTILS__;

export default {
  name: 'SpeedChart',

  emits: ['navigate', 'search', 'clear-search'],

  props: {
    wans:         { type: Array,   required: true },    // [{id, name, color, tests}]
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

      return this.wans.flatMap((w) => [
        { name: `${w.name} - Download`, data: mapMbps(w.tests, 'download_mbps') },
        { name: `${w.name} - Upload`,   data: mapMbps(w.tests, 'upload_mbps') },
        { name: `${w.name} - Ping`,     data: mapMs(w.tests) },
      ]);
    },

    seriesColors() {
      return this.wans.flatMap((w) => {
        const shades = deriveShades(w.color);
        return [shades.download, shades.upload, shades.ping];
      });
    },

    chartOptions() {
      const hiddenLabels = { style: { colors: '#9CA3AF' } };
      const yaxis = this.wans.flatMap((w, i) => {
        const isFirst = i === 0;
        return [
          {
            seriesName: `${w.name} - Download`,
            show:       isFirst,
            min:        0,
            max:        800,
            labels: isFirst
              ? { style: { colors: '#9CA3AF' }, formatter: (v) => `${v.toFixed(1)} Mbps` }
              : hiddenLabels,
          },
          { seriesName: `${w.name} - Upload`, show: false, min: 0, max: 800, labels: hiddenLabels },
          {
            seriesName: `${w.name} - Ping`,
            show:       isFirst,
            opposite:   true,
            min:        0,
            max:        800,
            labels: isFirst
              ? { style: { colors: '#9CA3AF' }, formatter: (v) => `${v.toFixed(0)} ms` }
              : hiddenLabels,
          },
        ];
      });

      return {
        chart: {
          background:  'transparent',
          toolbar:     { show: false },
          animations:  { enabled: true, speed: 400 },
        },
        theme:  { mode: 'dark' },
        colors: this.seriesColors,
        stroke: {
          curve:     'smooth',
          width:     this.wans.flatMap(() => [2, 2, 2]),
          dashArray: this.wans.flatMap(() => [0, 5, 2]),
        },
        xaxis: {
          type: 'datetime',
          // Em live mode fixa a janela de 24h; em search deixa auto-escalar
          min: this.mode === 'live' && this.windowStart ? this.windowStart : undefined,
          max: this.mode === 'live' && this.windowEnd   ? this.windowEnd   : undefined,
          labels: { style: { colors: '#9CA3AF' }, datetimeUTC: false },
        },
        yaxis,
        tooltip: {
          theme: 'dark',
          shared: true,
          custom: (opts) => this.buildTooltip(opts),
        },
        grid: {
          borderColor:    '#374151',
          strokeDashArray: 4,
        },
        legend: {
          position: 'top',
          labels:   { colors: '#D1D5DB' },
          // A cor já identifica a WAN (mesma do WanCard) — a legenda mostra só a métrica
          formatter: (seriesName) => seriesName.replace(/^.*- /, ''),
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

    // Monta um tooltip customizado agrupando, para cada série, o ponto mais
    // próximo do timestamp sob o cursor (tolerância de 1min), já que cada WAN
    // tem seus testes em instantes ligeiramente diferentes.
    buildTooltip({ series, seriesIndex, dataPointIndex, w }) {
      const TOLERANCE_MS = 120 * 1000;
      const allSeries = w.config.series;
      const hoveredX = allSeries[seriesIndex]?.data[dataPointIndex]?.x;
      if (hoveredX == null) return '';

      const rows = allSeries.map((s, i) => {
        const data = s.data;
        let closest = null;
        let closestDiff = Infinity;
        for (const point of data) {
          const diff = Math.abs(point.x - hoveredX);
          if (diff < closestDiff) {
            closestDiff = diff;
            closest = point;
          }
        }
        if (!closest || closestDiff > TOLERANCE_MS) return null;
        const isPing = i % 3 === 2;
        const value = isPing ? `${closest.y.toFixed(0)} ms` : `${closest.y.toFixed(1)} Mbps`;
        const color = w.globals.colors[i];
        const wanName = s.name.replace(/ - .*$/, '');
        return { wanName, name: s.name, value, color };
      }).filter(Boolean);

      if (!rows.length) return '';

      const dateLabel = new Date(hoveredX).toLocaleString('pt-BR', {
        day:    '2-digit',
        month:  '2-digit',
        hour:   '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      const groupSeparator = '<hr style="border:none; border-top:1px dashed #374151; margin:2px 0;">';
      const rowsHtml = rows.map((r, i) => {
        const isNewGroup = i > 0 && r.wanName !== rows[i - 1].wanName;
        const separator = isNewGroup ? groupSeparator : '';
        return `${separator}
        <div style="display:flex; align-items:center; gap:6px; padding:2px 0;">
          <span style="width:10px; height:10px; border-radius:2px; background:${r.color}; display:inline-block; flex-shrink:0;"></span>
          <span style="color:#D1D5DB;">${r.name.replace(/^.*- /, '')}</span>
          <span style="color:#F3F4F6; margin-left:auto; font-weight:600;">${r.value}</span>
        </div>
      `;
      }).join('');

      return `
        <div style="background:#1F2937; border:1px solid #374151; border-radius:6px; padding:8px 10px; min-width:180px;">
          <div style="color:#9CA3AF; font-size:11px; margin-bottom:4px; border-bottom:1px solid #374151; padding-bottom:4px;">${dateLabel}</div>
          ${rowsHtml}
        </div>
      `;
    },
  },
};
</script>
