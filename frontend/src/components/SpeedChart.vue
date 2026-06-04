<template>
  <div class="bg-gray-800 rounded-xl p-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-300">Histórico de Velocidade</h2>
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
    return {};
  },

  computed: {
    series() {
      const mapMbps = (tests, key) =>
        tests.map((t) => ({ x: new Date(t.created_at.replace(' ', 'T')).getTime(), y: parseFloat(t[key].toFixed(2)) }));
      const mapMs = (tests) =>
        tests.map((t) => ({ x: new Date(t.created_at.replace(' ', 'T')).getTime(), y: parseFloat(t.ping_ms.toFixed(1)) }));

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
      const wan1Ping    = `${this.wan1Name} - Ping`;

      return {
        chart: {
          background: 'transparent',
          toolbar: { show: false },
          animations: { enabled: true, speed: 400 },
        },
        theme: { mode: 'dark' },
        // WAN 1: tons de azul | WAN 2: tons de laranja
        colors: ['#3B82F6', '#93C5FD', '#BFDBFE', '#F59E0B', '#FCD34D', '#FDE68A'],
        stroke: {
          curve: 'smooth',
          width: [2, 2, 2, 2, 2, 2],
          // 0 = sólida (download), 5 = tracejada (upload), 2 = pontilhada (ping)
          dashArray: [0, 5, 2, 0, 5, 2],
        },
        xaxis: {
          type: 'datetime',
          labels: { style: { colors: '#9CA3AF' }, datetimeUTC: false },
        },
        yaxis: [
          {
            // Eixo esquerdo — Mbps (Download WAN 1)
            seriesName: wan1Download,
            min: 0,
            labels: {
              style: { colors: '#9CA3AF' },
              formatter: (v) => `${v.toFixed(1)} Mbps`,
            },
          },
          {
            // Upload WAN 1 — compartilha eixo Mbps
            seriesName: wan1Download,
            show: false,
          },
          {
            // Eixo direito — ms (Ping WAN 1)
            seriesName: wan1Ping,
            opposite: true,
            min: 0,
            labels: {
              style: { colors: '#9CA3AF' },
              formatter: (v) => `${v.toFixed(0)} ms`,
            },
          },
          {
            // Download WAN 2 — compartilha eixo Mbps
            seriesName: wan1Download,
            show: false,
          },
          {
            // Upload WAN 2 — compartilha eixo Mbps
            seriesName: wan1Download,
            show: false,
          },
          {
            // Ping WAN 2 — compartilha eixo ms
            seriesName: wan1Ping,
            show: false,
          },
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
