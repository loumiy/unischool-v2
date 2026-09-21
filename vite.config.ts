import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    // Sim-core tests only. reference/v1 is inert prior art and never runs.
    include: ['src/**/*.test.ts'],
    exclude: ['reference/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
