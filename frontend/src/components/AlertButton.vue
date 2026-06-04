<template>
  <button
    :disabled="status !== 'idle'"
    :class="buttonClass"
    class="px-5 py-2.5 rounded-lg text-sm font-semibold transition-colors disabled:cursor-not-allowed"
    @click="activate"
  >
    {{ buttonLabel }}
  </button>
</template>

<script>
export default {
  name: 'AlertButton',

  props: {
    vapidPublicKey: { type: String, required: true },
  },

  data() {
    return { status: 'idle' };
  },

  computed: {
    buttonLabel() {
      const labels = {
        idle:        '🔔 Ativar Alertas',
        active:      '✓ Alertas Ativos',
        unsupported: 'Sem suporte a Push',
        denied:      'Permissão negada',
        loading:     'Ativando...',
      };
      return labels[this.status] || 'Ativar Alertas';
    },
    buttonClass() {
      const classes = {
        idle:        'bg-blue-600 hover:bg-blue-500 text-white',
        active:      'bg-green-600 text-white',
        unsupported: 'bg-gray-600 text-gray-400',
        denied:      'bg-red-700 text-white',
        loading:     'bg-blue-800 text-white',
      };
      return classes[this.status] || 'bg-blue-600 text-white';
    },
  },

  mounted() {
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      this.status = 'unsupported';
      return;
    }
    if (Notification.permission === 'denied') {
      this.status = 'denied';
      return;
    }
    if (Notification.permission === 'granted') {
      // Verificar se já existe uma subscription ativa
      navigator.serviceWorker.ready.then((reg) =>
        reg.pushManager.getSubscription()
      ).then((sub) => {
        if (sub) this.status = 'active';
      }).catch(() => {});
    }
  },

  methods: {
    async activate() {
      if (this.status !== 'idle') return;
      this.status = 'loading';

      try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
          this.status = 'denied';
          return;
        }

        const registration = await navigator.serviceWorker.ready;

        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly:      true,
          applicationServerKey: this.urlBase64ToUint8Array(this.vapidPublicKey),
        });

        const res = await fetch('/api/push/register', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(subscription),
        });

        if (!res.ok) throw new Error(`Servidor retornou ${res.status}`);

        this.status = 'active';
      } catch (err) {
        console.error('[AlertButton] Falha ao ativar alertas:', err);
        this.status = 'idle';
        alert('Não foi possível ativar os alertas. Verifique o console para detalhes.');
      }
    },

    urlBase64ToUint8Array(base64String) {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = atob(base64);
      return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
    },
  },
};
</script>
