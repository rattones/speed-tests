<template>
  <div class="bg-gray-750 border border-blue-600/40 rounded-lg p-4 space-y-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Nome</label>
        <input
          v-model="local.name"
          type="text"
          class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Server ID (Ookla)</label>
        <input
          v-model="local.serverId"
          type="text"
          class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div>
        <label class="block text-xs text-gray-400 mb-1">Min. Download (Mbps)</label>
        <input
          v-model.number="local.minDownload"
          type="number" min="0" step="1"
          class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Min. Upload (Mbps)</label>
        <input
          v-model.number="local.minUpload"
          type="number" min="0" step="1"
          class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Max. Ping (ms)</label>
        <input
          v-model.number="local.maxPing"
          type="number" min="0" step="1"
          class="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500"
        />
      </div>
      <div>
        <label class="block text-xs text-gray-400 mb-1">Cor</label>
        <input
          v-model="local.colorHex"
          type="color"
          class="w-full h-[30px] bg-gray-700 border border-gray-600 rounded cursor-pointer"
        />
      </div>
    </div>

    <!-- Preview dos tons derivados -->
    <div class="flex items-center gap-2 text-xs text-gray-400">
      <span>Prévia:</span>
      <span class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: shades.download }"></span> Download
      </span>
      <span class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: shades.upload }"></span> Upload
      </span>
      <span class="flex items-center gap-1">
        <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: shades.ping }"></span> Ping
      </span>
    </div>

    <div class="flex items-center gap-2 pt-1">
      <button
        @click="handleSave"
        :disabled="saving || !local.name || !local.serverId"
        class="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors font-medium"
      >Salvar</button>
      <button
        @click="$emit('cancel')"
        class="px-4 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 rounded transition-colors"
      >Cancelar</button>
    </div>

    <server-ip-modal
      v-if="showIpModal"
      :wan-name="local.name"
      :server-id="local.serverId"
      @close="closeIpModalAndSave"
    />
  </div>
</template>

<script>
const { loadModule, options, defineAsyncComponent } = window.__SFC__;
const { deriveShades } = window.__COLOR_UTILS__;

export default {
  name: 'WanForm',

  emits: ['save', 'cancel'],

  components: {
    ServerIpModal: defineAsyncComponent(() => loadModule('/src/components/ServerIpModal.vue', options)),
  },

  props: {
    wan:    { type: Object,  required: true },
    saving: { type: Boolean, default: false },
  },

  data() {
    return {
      local:       { ...this.wan },
      showIpModal: false,
    };
  },

  computed: {
    shades() {
      return deriveShades(this.local.colorHex || '#3B82F6');
    },
  },

  methods: {
    handleSave() {
      // Server ID novo ou alterado: mostra a modal de instrução antes de confirmar o save
      if (this.local.serverId !== this.wan.serverId) {
        this.showIpModal = true;
        return;
      }
      this.$emit('save', this.local);
    },

    closeIpModalAndSave() {
      this.showIpModal = false;
      this.$emit('save', this.local);
    },
  },
};
</script>
