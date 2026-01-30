import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
      protocolImports: true,
    }),
  ],
  // 1. Treat WASM as assets so they get served correctly
  assetsInclude: ['**/*.wasm'],
  
  optimizeDeps: {
    // Exclude these so Vite doesn't try to bundle the WASM binaries
    exclude: ['@aztec/bb.js', '@noir-lang/noir_js', '@noir-lang/backend_barretenberg'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
  
  server: {
    // 2. CRITICAL: Security Headers for ZK/WASM Multithreading
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin',
    },
    fs: {
      // 3. Allow serving files from one level up (where your SDK/node_modules likely are)
      allow: ['..'] 
    }
  },
  
  build: {
    target: 'esnext', // Support Top-level await
    rollupOptions: {
      external: [
        'vite-plugin-node-polyfills/shims/global',
        'vite-plugin-node-polyfills/shims/buffer',
        'vite-plugin-node-polyfills/shims/process'
      ]
    }
  },
  
  resolve: {
    alias: {
      pino: 'pino/browser.js',
    },
  },
});