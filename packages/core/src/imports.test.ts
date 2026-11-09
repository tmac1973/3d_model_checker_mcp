import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The core runs in any browser page a host gives it: the app's webview, or
 * the MCP server's headless Chromium. So it may import only itself, three and
 * the glTF validator, and nothing that needs Node or a particular host.
 */
const ROOT = __dirname;
const PACKAGES = [/^three$/, /^three\/examples\/jsm\//, /^gltf-validator$/];

const SPECIFIER = /(?:from\s*|import\s*\(\s*)'([^']+)'/g;

function sources(dir = ''): string[] {
	return readdirSync(join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
		const rel = dir ? `${dir}/${e.name}` : e.name;
		if (e.isDirectory()) return sources(rel);
		const code = e.name.endsWith('.ts') && !/\.(test|d)\.ts$/.test(e.name);
		return code ? [rel] : [];
	});
}

function allowed(spec: string, from: string): boolean {
	if (PACKAGES.some((p) => p.test(spec))) return true;
	if (!spec.startsWith('.')) return false;
	const target = relative(ROOT, normalize(join(ROOT, dirname(from), spec)));
	return !target.startsWith('..');
}

describe('the core', () => {
	it('imports only itself, three and the validator', () => {
		const bad = sources().flatMap((f) =>
			[...readFileSync(join(ROOT, f), 'utf8').matchAll(SPECIFIER)]
				.map((m) => m[1])
				.filter((s) => !allowed(s, f))
				.map((s) => `${f} → ${s}`)
		);
		expect(bad).toEqual([]);
	});
});
