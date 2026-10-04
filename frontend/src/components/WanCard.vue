<template>
  <div
    class="rounded-xl shadow-lg bg-gray-800 border-l-4"
    style="padding: clamp(0.6rem, 1.8vh, 1.5rem);"
    :style="{ borderLeftColor: color }"
  >
    <!-- Header do card -->
    <div class="flex items-center justify-between" style="margin-bottom: clamp(0.5rem, 1.4vh, 1.25rem);">
      <label class="flex items-center gap-2 cursor-pointer min-w-0">
        <input
          type="checkbox"
          :checked="visible"
          @change="$emit('toggle-visible', wanKey)"
          title="Exibir no gráfico"
          class="w-4 h-4 rounded border-gray-600 bg-gray-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-gray-800 cursor-pointer flex-shrink-0"
        />
        <span
          v-if="orderNumber !== null"
          class="flex items-center justify-center w-5 h-5 rounded-full bg-gray-700 text-gray-300 text-xs font-semibold flex-shrink-0"
          title="Ordem de exibição"
        >{{ orderNumber }}</span>
        <div class="min-w-0">
          <h3 class="font-bold text-white truncate" style="font-size: clamp(0.9rem, 1.8vh, 1.125rem);">{{ wanName.replace('_', ' ') }}</h3>
          <p v-if="subtitle" class="text-gray-500 truncate" style="font-size: clamp(0.65rem, 1.1vh, 0.75rem);">{{ subtitle }}</p>
        </div>
      </label>
      <span
        class="w-3 h-3 rounded-full flex-shrink-0"
        :class="statusColor"
        :title="statusLabel"
      ></span>
    </div>

    <!-- Sem dados -->
    <div v-if="!latestTest" class="flex flex-col items-center gap-3" style="padding: clamp(0.5rem, 1.4vh, 1rem) 0;">
      <span class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem);">Nenhum teste realizado ainda</span>
      <button
        v-if="canRunTest"
        class="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors"
        :class="measuring
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
        :disabled="measuring"
        @click="$emit('run-test', wanKey)"
      >
        <span v-if="measuring" class="animate-spin inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></span>
        {{ measuring ? 'Medindo...' : 'Medir agora' }}
      </button>
    </div>

    <!-- Métricas -->
    <div v-else class="flex flex-col" style="gap: clamp(0.35rem, 1vh, 1rem);">
      <div class="flex items-baseline justify-between">
        <span class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem);">↓ Download</span>
        <span class="font-mono font-semibold" style="font-size: clamp(1.1rem, 2.4vh, 1.5rem);" :class="downloadColor">
          {{ latestTest.download_mbps.toFixed(1) }}
          <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">Mbps</span>
        </span>
      </div>

      <div class="flex items-baseline justify-between">
        <span class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem);">↑ Upload</span>
        <span class="font-mono font-semibold" style="font-size: clamp(1.1rem, 2.4vh, 1.5rem);" :class="uploadColor">
          {{ latestTest.upload_mbps.toFixed(1) }}
          <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">Mbps</span>
        </span>
      </div>

      <div class="flex items-baseline justify-between">
        <span class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem);">⏱ Ping</span>
        <span class="font-mono font-semibold" style="font-size: clamp(1rem, 2vh, 1.25rem);" :class="pingColor">
          {{ latestTest.ping_ms.toFixed(0) }}
          <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">ms</span>
          <span
            v-if="latestTest.jitter_ms != null"
            class="font-normal text-gray-400"
            style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);"
            title="Jitter (variação do ping)"
          >±{{ latestTest.jitter_ms.toFixed(0) }}</span>
        </span>
      </div>

      <!-- Perda de pacotes: linha sempre presente para manter a altura dos cards
           igual; sem valor (null/ausente), mostra o motivo em texto menor -->
      <div class="flex items-baseline justify-between">
        <span class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem);">📉 Perda</span>
        <span
          class="font-mono font-semibold"
          style="font-size: clamp(1rem, 2vh, 1.25rem);"
          :class="packetLossColor"
          :title="hasPacketLoss ? 'Perda de pacotes' : packetLossUnavailableHint"
        >
          <template v-if="hasPacketLoss">
            {{ latestTest.packet_loss.toFixed(2) }}
            <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">%</span>
          </template>
          <span v-else class="font-sans font-normal" style="font-size: clamp(0.65rem, 1.1vh, 0.75rem);">{{ packetLossUnavailable }}</span>
        </span>
      </div>

      <div class="border-t border-gray-700 flex items-center justify-between" style="padding-top: clamp(0.35rem, 1vh, 0.5rem);">
        <span class="text-gray-500" style="font-size: clamp(0.65rem, 1.1vh, 0.75rem);">{{ timeAgo(latestTest.created_at) }}</span>
        <button
          v-if="canRunTest"
          class="flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-colors"
          :class="measuring
            ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'"
          :disabled="measuring"
          @click="$emit('run-test', wanKey)"
        >
          <span v-if="measuring" class="animate-spin inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full"></span>
          {{ measuring ? 'Medindo...' : 'Medir agora' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'WanCard',

  emits: ['run-test', 'toggle-visible'],

  props: {
    wanName:     { type: String,  required: true },
    wanKey:      { type: [String, Number], required: true },
    orderNumber: { type: [String, Number], default: null },
    color:       { type: String,  default: '#3B82F6' },
    latestTest:  { type: Object,  default: null },
    minDownload: { type: Number,  default: 0 },
    minUpload:   { type: Number,  default: 0 },
    maxPing:     { type: Number,  default: 0 },
    measuring:   { type: Boolean, default: false },
    visible:     { type: Boolean, default: true },
    canRunTest:  { type: Boolean, default: true },
    subtitle:    { type: String,  default: '' },
    // Texto exibido no lugar da perda de pacotes quando ela não foi medida
    packetLossUnavailable:     { type: String, default: 'servidor não suporta' },
    packetLossUnavailableHint: {
      type: String,
      default: 'O servidor Ookla escolhido para esta WAN não mede perda de pacotes (ou o UDP está bloqueado) — escolha outro servidor para medi-la',
    },
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
      const dl = this.latestTest.download_mbps;
      if (dl < this.minDownload)       return 'text-red-400';
      if (dl <= this.minDownload * 1.2) return 'text-yellow-400';
      return 'text-green-400';
    },
    uploadColor() {
      if (!this.latestTest || this.minUpload === 0) return 'text-white';
      const ul = this.latestTest.upload_mbps;
      if (ul < this.minUpload)        return 'text-red-400';
      if (ul <= this.minUpload * 1.2) return 'text-yellow-400';
      return 'text-green-400';
    },
    // Ping: menor é melhor — ruim acima do máximo, médio até 20% abaixo dele.
    pingColor() {
      if (!this.latestTest || this.maxPing === 0) return 'text-gray-200';
      const ping = this.latestTest.ping_ms;
      if (ping > this.maxPing)        return 'text-red-400';
      if (ping >= this.maxPing * 0.8) return 'text-yellow-400';
      return 'text-green-400';
    },
    // Perda de pacotes: 0% bom, abaixo de 1% médio, a partir de 1% ruim.
    hasPacketLoss() {
      return Number.isFinite(this.latestTest?.packet_loss);
    },
    packetLossColor() {
      if (!this.hasPacketLoss) return 'text-gray-500';
      const loss = this.latestTest.packet_loss;
      if (loss >= 1)    return 'text-red-400';
      if (loss > 0)     return 'text-yellow-400';
      return 'text-green-400';
    },
  },

  methods: {
    timeAgo(dateStr) {
      const diff = Math.floor((Date.now() - new Date(dateStr.replace(' ', 'T')).getTime()) / 1000);
      if (diff < 60)   return `há ${diff}s`;
      if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
      return `há ${Math.floor(diff / 3600)}h`;
    },
  },
};
</script>
