import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Each package holds its own *.test.ts next to the source under test.
    include: ['packages/*/src/**/*.test.ts'],
    environment: 'node',
    clearMocks: true,
  },
});
