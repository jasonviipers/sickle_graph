import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['esm'], // Matches your "type": "module" in package.json
  platform: 'node', // Explicitly target Node.js
  target: 'node22', // Matches your Node.js version on Render
  dts: true, // Generate type definitions
  sourcemap: true,
  clean: true,
  bundle: true, // Recommended for deployments
  splitting: false, // Simpler for server environments
  external: [
    // Only truly external dependencies should go here
    '@elizaos/cli', 
    '@elizaos/core'
  ],
  esbuildOptions(options) {
    // Ensure Node.js built-ins are handled properly
    options.platform = 'node';
  },
});