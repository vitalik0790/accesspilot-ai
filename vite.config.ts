import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'OPENAI_');
  return {
    plugins: [react()],
    define: {
      __OPENAI_API_KEY__: JSON.stringify(env.OPENAI_API_KEY || ''),
      __OPENAI_MODEL__: JSON.stringify(env.OPENAI_MODEL || 'gpt-4.1-mini'),
    },
    build: {
      rollupOptions: {
        input: { popup: 'popup.html', background: 'src/background/index.ts' },
        output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
      },
    },
  };
});
