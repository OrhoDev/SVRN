import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      // This ensures node:fs, node:buffer, etc are handled
      protocolImports: true,
    }),
  ],
  resolve: {
    alias: {
      // THIS IS THE FIX for the ENOTDIR error
      // It prevents the polyfiller from looking for the non-existent /promises directory
      'fs/promises': 'node-stdlib-browser/esm/mock/empty',
      'node:fs/promises': 'node-stdlib-browser/esm/mock/empty',
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis'
      }
    },
  },
  build: {
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
});