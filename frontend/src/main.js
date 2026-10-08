import { createApp } from 'vue';
import VueApexCharts from 'vue3-apexcharts';
import App from './App.vue';
import './style.css';

const app = createApp(App);

// Registrar vue3-apexcharts globalmente
app.component('VueApexCharts', VueApexCharts);

app.mount('#app');
