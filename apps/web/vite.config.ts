import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

const target = process.env.API_URL ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: { include: ['@quizz/shared'] },
  build: { commonjsOptions: { include: [/shared/, /node_modules/] } },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': target,
      '/socket.io': { target, ws: true },
    },
  },
});
