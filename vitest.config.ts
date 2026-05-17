import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules', 'dist'],
    },
  },
  resolve: {
    alias: {
      '@parser': path.resolve(__dirname, 'src/parser'),
      '@security': path.resolve(__dirname, 'src/security'),
      '@tools': path.resolve(__dirname, 'src/tools'),
      '@resolver': path.resolve(__dirname, 'src/resolver'),
      '@rag': path.resolve(__dirname, 'src/rag'),
      '@pi-agent': path.resolve(__dirname, 'src/pi-agent'),
    },
  },
});
