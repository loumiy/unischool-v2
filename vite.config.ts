import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  // Relative asset paths (Phase 34): the build runs from whatever folder it
  // is unpacked into — itch.io serves a game from a subpath in an iframe.
  base: './',
  test: {
    // Sim-core tests only. reference/v1 is inert prior art and never runs.
    include: ['src/**/*.test.ts'],
    exclude: ['reference/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
