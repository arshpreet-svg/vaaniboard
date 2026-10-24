import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    include: ['test/**/*.test.{js,jsx}'],
    environment: 'node',
  },
});
