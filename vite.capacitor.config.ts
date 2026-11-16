import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(__dirname, 'resources/capacitor'),
  base: './',
  plugins: [vue(), tailwindcss()],
  define: {
    'import.meta.env.VITE_CAPACITOR_BUILD': JSON.stringify('1'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'resources/ts'),
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist-capacitor'),
    emptyOutDir: true,
  },
});
