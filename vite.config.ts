import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { backendOrigin, boundaryPlugin } from './build-config';
export default defineConfig(({ mode }) => {
  // Only this public setting is substituted. No VITE_* or server env is exposed.
  const env = loadEnv(mode, process.cwd(), 'ACCESSPILOT_');
  const origin = backendOrigin(env.ACCESSPILOT_BACKEND_URL || '', mode === 'local');
  const oldSecrets = loadEnv(mode, process.cwd(), 'OPENAI_');
  return {
    envPrefix: 'ACCESSPILOT_PUBLIC_UNUSED_', publicDir: false,
    plugins: [react(), boundaryPlugin(origin, [oldSecrets.OPENAI_API_KEY || '', process.env.OPENAI_API_KEY || ''])],
    define: { __ACCESSPILOT_BACKEND_URL__: JSON.stringify(origin) },
    build: { rollupOptions: {
      input: { popup: 'popup.html', background: 'src/background/index.ts' },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
    } },
  };
});
