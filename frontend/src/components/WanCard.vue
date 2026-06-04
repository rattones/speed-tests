<template>
  <div class="rounded-xl shadow-lg p-6 bg-gray-800">
    <!-- Header do card -->
    <div class="flex items-center justify-between mb-5">
      <h3 class="text-lg font-bold text-white">{{ wanName.replace('_', ' ') }}</h3>
      <span
        class="w-3 h-3 rounded-full"
        :class="statusColor"
        :title="statusLabel"
      ></span>
    </div>

    <!-- Sem dados -->
    <div v-if="!latestTest" class="text-gray-400 text-sm py-4 text-center">
      Nenhum teste realizado ainda
    </div>

    <!-- Métricas -->
    <div v-else class="space-y-4">
      <div class="flex items-baseline justify-between">
        <span class="text-gray-400 text-sm">↓ Download</span>
        <span class="text-2xl font-mono font-semibold" :class="downloadColor">
          {{ latestTest.download_mbps.toFixed(1) }}
          <span class="text-sm font-normal text-gray-400">Mbps</span>
        </span>
      </div>

      <div class="flex items-baseline justify-between">
        <span class="text-gray-400 text-sm">↑ Upload</span>
        <span class="text-2xl font-mono font-semibold" :class="uploadColor">
          {{ latestTest.upload_mbps.toFixed(1) }}
          <span class="text-sm font-normal text-gray-400">Mbps</span>
        </span>
      </div>

      <div class="flex items-baseline justify-between">
        <span class="text-gray-400 text-sm">⏱ Ping</span>
        <span class="text-xl font-mono font-semibold text-gray-200">
          {{ latestTest.ping_ms.toFixed(0) }}
          <span class="text-sm font-normal text-gray-400">ms</span>
        </span>
      </div>

      <div class="pt-2 border-t border-gray-700 text-xs text-gray-500 text-right">
        {{ timeAgo(latestTest.created_at) }}
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WanCard',

  props: {
    wanName:     { type: String,  required: true },
    latestTest:  { type: Object,  default: null },
    minDownload: { type: Number,  default: 0 },
    minUpload:   { type: Number,  default: 0 },
  },

  computed: {
    isOk() {
      if (!this.latestTest) return null;
      return (
        this.latestTest.download_mbps >= this.minDownload &&
        this.latestTest.upload_mbps   >= this.minUpload
      );
    },
    statusColor() {
      if (this.isOk === null)  return 'bg-gray-500';
      return this.isOk ? 'bg-green-500' : 'bg-red-500';
    },
    statusLabel() {
      if (this.isOk === null)  return 'Sem dados';
      return this.isOk ? 'Dentro do limite' : 'Abaixo do limite';
    },
    downloadColor() {
      if (!this.latestTest || this.minDownload === 0) return 'text-white';
      return this.latestTest.download_mbps >= this.minDownload ? 'text-green-400' : 'text-red-400';
    },
    uploadColor() {
      if (!this.latestTest || this.minUpload === 0) return 'text-white';
      return this.latestTest.upload_mbps >= this.minUpload ? 'text-green-400' : 'text-red-400';
    },
  },

  methods: {
    timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
      if (diff < 60)   return `há ${diff}s`;
      if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
      return `há ${Math.floor(diff / 3600)}h`;
    },
  },
};
</script>
