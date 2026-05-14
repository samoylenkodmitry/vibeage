import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          globals: true,
          include: [
            'tests/**/*.{test,spec}.{ts,tsx}',
            'vitest/**/*.{test,spec}.{ts,tsx}',
            'server/__tests__/**/*.{test,spec}.{ts,tsx}',
          ],
          exclude: [
            'tests/e2e/**',
            'tests/e2e-vite/**',
          ],
        },
      },
    ],
  },
});
