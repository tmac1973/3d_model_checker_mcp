import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
		environment: 'node',
		globals: true,
		// The browser test starts Chromium and builds real models.
		testTimeout: 120_000,
		hookTimeout: 120_000
	}
});
