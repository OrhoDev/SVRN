import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // Include JSON files in the bundle
  loader: {
    '.json': 'json'
  },
  external: [
    '@aztec/bb.js',
    '@noir-lang/noir_js',
    '@coral-xyz/anchor',
    '@solana/web3.js',
    '@solana/spl-token',
    '@arcium-hq/client',
    'bn.js',
    'buffer'
  ],
  banner: {
    js: 'import { Buffer } from "buffer";\nglobal.Buffer = Buffer;'
  }
});
