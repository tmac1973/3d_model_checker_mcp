import { join } from 'node:path';
import { defineConfig } from 'vite';

/** The script the headless page runs: the core, bundled with three and the validator. */
export default defineConfig({
	logLevel: 'warn',
	build: {
		lib: {
			entry: join(import.meta.dirname, 'src/page/entry.ts'),
			formats: ['iife'],
			name: 'Check3dPage',
			fileName: () => 'page.js'
		},
		outDir: 'dist',
		emptyOutDir: false,
		minify: true,
		copyPublicDir: false
	}
});
