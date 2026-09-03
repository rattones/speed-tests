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
          <p class="text-xs text-gray-500 mt-2">
            Formato: <span class="font-mono text-gray-400">minuto hora dia-do-mês mês dia-da-semana</span>.
            Cada campo aceita <span class="font-mono text-gray-400">*</span> (qualquer valor) ou
            <span class="font-mono text-gray-400">*/N</span> (a cada N).
            Ex.: <span class="font-mono text-gray-400">*/15 * * * *</span> = a cada 15 minutos, todo dia, o dia todo.
          </p>
        </section>

        <!-- Lista de WANs -->
        <section v-if="activeTab === 'wans'">
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

        <!-- Lista de dispositivos da rede local -->
        <section v-else>
          <h3 class="text-sm font-semibold text-gray-300 mb-1">Dispositivos da rede local</h3>
          <p class="text-xs text-gray-500 mb-3">
            Cadastrados automaticamente quando o agente envia a primeira medição. Aqui você
            ajusta nome, cor, ordem e limites de alerta.
          </p>

          <div v-if="!localDevices.length" class="text-xs text-gray-500 bg-gray-750 border border-gray-700 rounded-lg px-4 py-3">
            Nenhum dispositivo ainda. Use "Monitorar um computador" na aba Rede Local.
          </div>

          <div class="space-y-3">
            <div v-for="d in localDevices" :key="d.id">
              <device-form
                v-if="editingDevice && editingDevice.id === d.id"
                :device="editingDevice"
                :saving="saving"
                @save="saveDevice"
                @cancel="editingDevice = null"
              />
              <div
                v-else
                class="flex items-center justify-between gap-3 bg-gray-750 border border-gray-700 rounded-lg px-4 py-3"
                :class="{ 'opacity-50': !d.active }"
              >
                <div class="flex items-center gap-3 min-w-0">
                  <span class="w-4 h-4 rounded-full flex-shrink-0" :style="{ backgroundColor: d.colorHex }"></span>
                  <div class="min-w-0">
                    <p class="text-white font-medium truncate">
                      {{ d.name }}
                      <span v-if="!d.active" class="text-xs text-gray-500 font-normal">(monitoramento desativado)</span>
                    </p>
                    <p class="text-xs text-gray-400 truncate">
                      {{ d.machineId }}
                      <span v-if="d.connType && d.connType !== 'unknown'"> · {{ d.connType === 'wifi' ? 'WiFi' : 'Cabo' }}</span>
                      <span v-if="d.os"> · {{ d.os }}</span>
                      · min ↓{{ d.minDownload }} ↑{{ d.minUpload }} Mbps · max ping {{ d.maxPing }}ms
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-shrink-0">
                  <button
                    @click="toggleDeviceActive(d)"
                    :class="d.active ? 'text-yellow-400 hover:text-yellow-300' : 'text-green-400 hover:text-green-300'"
                    class="text-sm transition-colors"
                  >{{ d.active ? 'Desativar' : 'Ativar' }}</button>
                  <button @click="startEditDevice(d)" class="text-sm text-blue-400 hover:text-blue-300 transition-colors">Editar</button>
                  <button @click="deleteDevice(d)" class="text-sm text-red-400 hover:text-red-300 transition-colors">Remover</button>
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
    WanForm:    defineAsyncComponent(() => loadModule('/src/components/WanForm.vue', options)),
    DeviceForm: defineAsyncComponent(() => loadModule('/src/components/DeviceForm.vue', options)),
  },

  props: {
    cronInterval: { type: String, required: true },
    activeTab:    { type: String, default: 'wans' },
  },

  data() {
    return {
      localCron:     this.cronInterval,
      localWans:     [],
      localDevices:  [],
      editingWan:    null,
      newWan:        null,
      editingDevice: null,
      saving:        false,
      errorMsg:      '',
    };
  },

  async mounted() {
    if (this.activeTab === 'lan') {
      await this.fetchAllDevices();
    } else {
      await this.fetchAllWans();
    }
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
      this.newWan = { name: '', serverId: '', colorHex: '#3B82F6', minDownload: 0, minUpload: 0, maxPing: 0, sortOrder: this.localWans.length };
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

    // ── Dispositivos da rede local ──────────────────────────────────────────
    async fetchAllDevices() {
      try {
        const res = await fetch('/api/lan/devices?all=1');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        this.localDevices = json.data;
      } catch (err) {
        console.error('[ConfigPanel] Erro ao carregar dispositivos:', err);
      }
    },

    startEditDevice(device) {
      this.editingDevice = { ...device };
    },

    async toggleDeviceActive(device) {
      this.errorMsg = '';
      try {
        const res = await fetch(`/api/lan/devices/${device.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...device, active: !device.active }),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        await this.fetchAllDevices();
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      }
    },

    async saveDevice(device) {
      this.saving = true;
      this.errorMsg = '';
      try {
        const res = await fetch(`/api/lan/devices/${device.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(device),
        });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        this.editingDevice = null;
        await this.fetchAllDevices();
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      } finally {
        this.saving = false;
      }
    },

    async deleteDevice(device) {
      if (!confirm(`Remover ${device.name}? O dispositivo e todo o seu histórico de medições serão apagados definitivamente.`)) return;
      this.errorMsg = '';
      try {
        const res = await fetch(`/api/lan/devices/${device.id}`, { method: 'DELETE' });
        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${res.status}`);
        }
        await this.fetchAllDevices();
        this.$emit('changed');
      } catch (err) {
        this.errorMsg = err.message;
      }
    },
  },
};
</script>
