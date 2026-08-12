<template>
  <div class="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50" @click.self="$emit('close')">
    <div class="bg-gray-800 rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">

      <div class="flex items-center justify-between px-6 py-4 border-b border-gray-700">
        <h2 class="text-lg font-bold text-white">Configurações</h2>
        <button @click="$emit('close')" class="text-gray-400 hover:text-white text-xl leading-none">✕</button>
      </div>

      <div class="p-6 space-y-8">

        <!-- Intervalo de coleta -->
        <section>
          <h3 class="text-sm font-semibold text-gray-300 mb-2">Intervalo de coleta (cron)</h3>
          <div class="flex items-end gap-2">
            <input
              v-model="localCron"
              type="text"
              placeholder="*/15 * * * *"
              class="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-1.5 text-sm text-white font-mono focus:outline-none focus:border-blue-500"
            />
            <button
              @click="saveCron"
              :disabled="saving || localCron === cronInterval"
              class="px-4 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded transition-colors font-medium"
            >Salvar</button>
          </div>
        </section>

        <!-- Lista de WANs -->
        <section>
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-sm font-semibold text-gray-300">WANs monitoradas</h3>
            <button
              v-if="!newWan"
              @click="startCreate"
              class="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >+ Adicionar WAN</button>
          </div>

          <div class="space-y-3">
            <wan-form
              v-if="newWan"
              :wan="newWan"
              :saving="saving"
              @save="saveWan"
              @cancel="newWan = null"
            />

            <div v-for="w in localWans" :key="w.id">
              <wan-form
                v-if="editingWan && editingWan.id === w.id"
                :wan="editingWan"
                :saving="saving"
                @save="saveWan"
                @cancel="editingWan = null"
              />
              <div
                v-else
                class="flex items-center justify-between gap-3 bg-gray-750 border border-gray-700 rounded-lg px-4 py-3"
                :class="{ 'opacity-50': !w.active }"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="w-4 h-4 rounded-full flex-shrink-0" :style="{ backgroundColor: w.colorHex }"></span>
                  <div class="min-w-0">
                    <p class="text-white font-medium truncate">
                      {{ w.name }}
                      <span v-if="!w.active" class="text-xs text-gray-500 font-normal">(monitoramento desativado)</span>
                    </p>
                    <p class="text-xs text-gray-400 truncate">
                      Server ID: {{ w.serverId }} · min ↓{{ w.minDownload }} ↑{{ w.minUpload }} Mbps · max ping {{ w.maxPing }}ms
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button
                    @click="toggleActive(w)"
                    :class="w.active ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'"
                    class="text-sm transition-colors"
                  >{{ w.active ? 'Desativar' : 'Ativar' }}</button>
                  <button @click="startEdit(w)" class="text-sm text-blue-400 hover:text-blue-300 transition-colors">Editar</button>
                  <button @click="deleteWan(w)" class="text-sm text-red-400 hover:text-red-300 transition-colors">Remover</button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <p v-if="errorMsg" class="text-sm text-red-400">{{ errorMsg }}</p>

      </div>
    </div>
  </div>
</template>

<script>
const { loadModule, options, defineAsyncComponent } = window.__SFC__;

export default {
  name: 'ConfigPanel',

  emits: ['close', 'changed'],

  components: {
    WanForm: defineAsyncComponent(() => loadModule('/src/components/WanForm.vue', options)),
  },

  props: {
    wans:         { type: Array,  required: true },
    cronInterval: { type: String, required: true },
  },

  data() {
    return {
      localCron:  this.cronInterval,
      localWans:  this.wans,
      editingWan: null,
      newWan:     null,
      saving:     false,
      errorMsg:   '',
    };
  },

  async mounted() {
    // A prop `wans` do App.vue só traz WANs ativas (usadas nos cards/gráfico);
    // aqui precisamos também das desativadas, para poder reativá-las.
    await this.fetchAllWans();
  },

  methods: {
    async fetchAllWans() {
      try {
        const res = await fetch('/api/config/wans?all=1');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.localWans = json.data;
      } catch (err) {
        console.error('[ConfigPanel] Erro ao carregar WANs:', err);
      }
    },

    async toggleActive(wan) {
      this.errorMsg = '';
      try {
        const res = await fetch(`/api/config/wans/${wan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...wan, active: !wan.active }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        await this.fetchAllWans();
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      }
    },

    startCreate() {
      this.editingWan = null;
      this.newWan = { name: '', serverId: '', colorHex: '#3B82F6', minDownload: 0, minUpload: 0, maxPing: 0 };
    },

    startEdit(wan) {
      this.newWan = null;
      this.editingWan = { ...wan };
    },

    async saveWan(wan) {
      this.saving = true;
      this.errorMsg = '';
      try {
        const isNew = !wan.id;
        const res = await fetch(isNew ? '/api/config/wans' : `/api/config/wans/${wan.id}`, {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(wan),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        this.newWan = null;
        this.editingWan = null;
        await this.fetchAllWans();
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      } finally {
        this.saving = false;
      }
    },

    async deleteWan(wan) {
      if (!confirm(`Remover ${wan.name}? O histórico de testes será preservado.`)) return;
      this.errorMsg = '';
      try {
        const res = await fetch(`/api/config/wans/${wan.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        await this.fetchAllWans();
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      }
    },

    async saveCron() {
      this.saving = true;
      this.errorMsg = '';
      try {
        const res = await fetch('/api/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cronInterval: this.localCron }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      } finally {
        this.saving = false;
      }
    },
  },
};
</script>
