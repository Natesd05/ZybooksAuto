import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost:4173/zybook/demo/chapter/1/section/1' } },
    include: ['tests/unit/**/*.test.ts'],
    restoreMocks: true,
  },
});
