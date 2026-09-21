import { defineConfig } from 'vite';
export default defineConfig({
  publicDir: false,
  build: { ssr: 'server/index.ts', outDir: 'build/server', target: 'node22', minify: false,
    rollupOptions: { output: { entryFileNames: 'index.js' } } },
});
