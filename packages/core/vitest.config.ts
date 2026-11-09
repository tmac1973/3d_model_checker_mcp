import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'jsdom',
		globals: true,
		sequence: { shuffle: true }
	}
});
