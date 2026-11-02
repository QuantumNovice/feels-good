import { createApp } from 'vue';
import './style.css';
import './controls.css';
import './responsive.css';
import App from './App.vue';
import { initAnalytics } from './services/analytics';

void initAnalytics();
createApp(App).mount('#app');
// `pnpm car` sets this in development so the browser follows the emulator console or keyboard car.
if (import.meta.env.DEV && import.meta.env.VITE_CAR_BRIDGE && !window.Spotlane)
  void import('./services/carBridge').then(({ connectCarBridge }) =>
    connectCarBridge(import.meta.env.VITE_CAR_BRIDGE!),
  );
