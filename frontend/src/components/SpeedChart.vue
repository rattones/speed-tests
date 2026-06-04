<template>
  <div class="bg-gray-800 rounded-xl p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-300">Histórico de Velocidade</h2>
      <div class="flex gap-2">
        <button
          v-for="metric in metrics"
          :key="metric.value"
          class="px-3 py-1 rounded-full text-sm font-medium transition-colors"
          :class="activeMetric === metric.value
            ? 'bg-blue-600 text-white'
            : 'bg-gray-700 text-gray-400 hover:bg-gray-600'"
          @click="activeMetric = metric.value"
        >
          {{ metric.label }}
        </button>
      </div>
    </div>

    <!-- Sem dados -->
    <div
      v-if="!wan1Tests.length && !wan2Tests.length"
      class="flex items-center justify-center h-64 text-gray-500"
    >
      Nenhum dado disponível ainda
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

  props: {
    wan1Tests: { type: Array, required: true },
    wan2Tests: { type: Array, required: true },
    wan1Name:  { type: String, default: 'WAN 1' },
    wan2Name:  { type: String, default: 'WAN 2' },
  },

  data() {
    return {
      activeMetric: 'download',
      metrics: [
        { label: 'Download', value: 'download' },
        { label: 'Upload',   value: 'upload' },
      ],
    };
  },

  computed: {
    series() {
      const key = this.activeMetric === 'download' ? 'download_mbps' : 'upload_mbps';
      return [
        {
          name: this.wan1Name,
          data: this.wan1Tests.map((t) => ({
            x: new Date(t.created_at).getTime(),
            y: parseFloat(t[key].toFixed(2)),
          })),
        },
        {
          name: this.wan2Name,
          data: this.wan2Tests.map((t) => ({
            x: new Date(t.created_at).getTime(),
            y: parseFloat(t[key].toFixed(2)),
          })),
        },
      ];
    },

    chartOptions() {
      return {
        chart: {
          background: 'transparent',
          toolbar: { show: false },
          animations: { enabled: true, speed: 400 },
        },
        theme: { mode: 'dark' },
        colors: ['#3B82F6', '#F59E0B'],
        stroke: { curve: 'smooth', width: 2 },
        xaxis: {
          type: 'datetime',
          labels: { style: { colors: '#9CA3AF' } },
        },
        yaxis: {
          labels: {
            style: { colors: '#9CA3AF' },
            formatter: (val) => `${val.toFixed(1)} Mbps`,
          },
          min: 0,
        },
        tooltip: {
          x: { format: 'dd/MM HH:mm' },
          y: { formatter: (val) => `${val.toFixed(1)} Mbps` },
          theme: 'dark',
        },
        grid: {
          borderColor: '#374151',
          strokeDashArray: 4,
        },
        legend: {
          position: 'top',
          labels: { colors: '#D1D5DB' },
        },
        markers: { size: 0 },
      };
    },
  },
};
</script>
