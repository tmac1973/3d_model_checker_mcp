#!/usr/bin/env node
// Build dist/three-kit.js: three, GLTFExporter and the modelling kit as one
// classic (IIFE) script, for build modules run by check_3d in a sandboxed
// frame (src/three/kitEntry.ts). A host serves it and passes its URL as
// `kitUrl`: a sandboxed frame can load a classic script but not modules.
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

await build({
	configFile: false,
	logLevel: 'warn',
	build: {
		lib: {
			entry: join(root, 'src/three/kitEntry.ts'),
			formats: ['iife'],
			name: 'HaruspexThreeKitBundle',
			fileName: () => 'three-kit.js'
		},
		outDir: join(root, 'dist'),
		emptyOutDir: false,
		minify: true,
		copyPublicDir: false
	}
});
