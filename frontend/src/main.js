import * as Vue from 'vue';
import { createApp, defineAsyncComponent } from 'vue';
import { loadModule } from 'https://cdn.jsdelivr.net/npm/vue3-sfc-loader@0.9.5/dist/vue3-sfc-loader.esm.js';
import VueApexCharts from 'https://cdn.jsdelivr.net/npm/vue3-apexcharts@1.11.1/dist/vue3-apexcharts.js';

// Opções do vue3-sfc-loader
// IMPORTANTE: moduleCache.vue deve ser o objeto de módulo Vue diretamente (não uma função),
// para garantir que o sfc-loader use a mesma instância que o createApp.
const sfcLoaderOptions = {
  moduleCache: {
    vue: Vue,
  },
  async getFile(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`[sfc-loader] Falha ao carregar: ${url} (${res.status})`);
    return { getContentData: () => res.text() };
  },
  addStyle(textContent) {
    const style = document.createElement('style');
    style.textContent = textContent;
    document.head.appendChild(style);
  },
};

// Expõe no window para que os SFCs carregados pelo sfc-loader possam acessar
window.__SFC__ = { loadModule, options: sfcLoaderOptions, defineAsyncComponent };

// Montar a aplicação
const App = defineAsyncComponent(() => loadModule('/src/App.vue', sfcLoaderOptions));
const app = createApp(App);

// Registrar vue3-apexcharts globalmente
app.component('VueApexCharts', VueApexCharts);

app.mount('#app');
