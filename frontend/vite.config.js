import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// URL do backend usada pelo servidor de desenvolvimento (`npm run dev`)
// para encaminhar as chamadas /api. Em produção o próprio backend serve o build.
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8020';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': BACKEND_URL,
    },
  },
  build: {
    outDir: 'dist',
    // ApexCharts minificado tem ~600 kB (170 kB gzip) — tamanho esperado
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // ApexCharts é a maior dependência — chunk próprio para melhor cache
        manualChunks: {
          apexcharts: ['apexcharts', 'vue3-apexcharts'],
        },
      },
    },
  },
});
