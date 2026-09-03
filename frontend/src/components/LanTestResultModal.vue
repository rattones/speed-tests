<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" @click.self="$emit('close')">
    <div class="bg-gray-800 rounded-xl shadow-lg w-full border-l-4 border-blue-500 flex flex-col" style="max-width: min(90vw, 32rem); max-height: 90vh;">

      <div class="flex items-center justify-between border-b border-gray-700 flex-shrink-0" style="padding: clamp(0.5rem, 1.5vh, 1rem) clamp(1rem, 2vw, 1.5rem);">
        <h2 class="font-bold text-white" style="font-size: clamp(1rem, 2vh, 1.125rem);">
          Teste deste computador
          <span class="text-gray-500 font-normal block" style="font-size: clamp(0.65rem, 1.1vh, 0.75rem); margin-top: 0.125rem;">não salvo, só exibição</span>
        </h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white text-xl leading-none">✕</button>
      </div>

      <div class="overflow-y-auto min-h-0" style="padding: clamp(0.75rem, 2vh, 1.5rem);">
        <div v-if="test.error" class="text-red-400" style="font-size: clamp(0.8rem, 1.4vh, 0.875rem);">{{ test.error }}</div>

        <div v-else-if="test.running" class="flex items-center gap-3 text-gray-300" style="font-size: clamp(0.8rem, 1.4vh, 0.875rem); margin-bottom: clamp(0.5rem, 1.4vh, 1rem);">
          <span class="animate-spin inline-block w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full"></span>
          {{ phaseLabel }}
        </div>

        <div v-if="!test.error" class="grid grid-cols-3 gap-4">
          <div>
            <p class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem); margin-bottom: clamp(0.15rem, 0.4vh, 0.25rem);">↓ Download</p>
            <p class="font-mono font-semibold text-white" style="font-size: clamp(1.1rem, 2.4vh, 1.5rem);">
              {{ fmt(liveOrFinal('download_mbps')) }}
              <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">Mbps</span>
            </p>
          </div>
          <div>
            <p class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem); margin-bottom: clamp(0.15rem, 0.4vh, 0.25rem);">↑ Upload</p>
            <p class="font-mono font-semibold text-white" style="font-size: clamp(1.1rem, 2.4vh, 1.5rem);">
              {{ fmt(liveOrFinal('upload_mbps')) }}
              <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">Mbps</span>
            </p>
          </div>
          <div>
            <p class="text-gray-400" style="font-size: clamp(0.75rem, 1.3vh, 0.875rem); margin-bottom: clamp(0.15rem, 0.4vh, 0.25rem);">⏱ Ping</p>
            <p class="font-mono font-semibold text-gray-200" style="font-size: clamp(1rem, 2vh, 1.25rem);">
              {{ test.result ? test.result.ping_ms.toFixed(0) : '—' }}
              <span class="font-normal text-gray-400" style="font-size: clamp(0.7rem, 1.2vh, 0.875rem);">ms</span>
              <span v-if="test.result" class="text-gray-500 ml-1" style="font-size: clamp(0.65rem, 1.1vh, 0.75rem);">
                ± {{ test.result.jitter_ms.toFixed(1) }}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div class="border-t border-gray-700 flex justify-end flex-shrink-0" style="padding: clamp(0.5rem, 1.2vh, 1rem) clamp(1rem, 2vw, 1.5rem);">
        <button
          @click="$emit('close')"
          class="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 rounded transition-colors font-medium"
        >Fechar</button>
      </div>

    </div>
  </div>
</template>

<script>
const PHASE_LABELS = {
  ping:     'Medindo latência...',
  download: 'Testando download...',
  upload:   'Testando upload...',
  done:     'Concluído',
};

export default {
  name: 'LanTestResultModal',

  emits: ['close'],

  props: {
    test: { type: Object, required: true },
  },

  computed: {
    phaseLabel() {
      return PHASE_LABELS[this.test.phase] || 'Testando...';
    },
  },

  methods: {
    fmt(v) {
      return v == null ? '—' : Number(v).toFixed(1);
    },
    liveOrFinal(key) {
      if (this.test.result) return this.test.result[key];
      const phase = key === 'download_mbps' ? 'download' : 'upload';
      return this.test.liveMbps[phase];
    },
  },
};
</script>
