import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
export default defineConfig({
  plugins: [vue()],
  base: './',
  build: { outDir: '../app/src/main/assets/ui', emptyOutDir: true },
});
