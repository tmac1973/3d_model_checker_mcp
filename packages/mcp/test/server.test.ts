/**
 * The built server, end to end: a real MCP client over stdio, a real
 * Chromium, real models. Run `npm run build` first.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const CLI = join(import.meta.dirname, '..', 'dist', 'cli.js');

const FLASK = `export default function build(THREE) {
  const asset = new THREE.Group();
  const pts = [[0, 0], [0.12, 0.02], [0.15, 0.1], [0.05, 0.22], [0.04, 0.3]].map(([x, y]) => new THREE.Vector2(x, y));
  const flask = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), new THREE.MeshStandardMaterial());
  flask.name = 'Flask';
  asset.add(flask);
  return asset;
}
`;

/** A 2 × 2 RGB PNG, so a texture has something real to decode. */
function png(): Buffer {
	const chunk = (type: string, data: Buffer) => {
		const body = Buffer.concat([Buffer.from(type), data]);
		const out = Buffer.alloc(12 + data.length);
		out.writeUInt32BE(data.length, 0);
		body.copy(out, 4);
		out.writeUInt32BE(crc32(body), 8 + data.length);
		return out;
	};
	const header = Buffer.alloc(13);
	header.writeUInt32BE(2, 0);
	header.writeUInt32BE(2, 4);
	header.set([8, 2, 0, 0, 0], 8);
	const rows = Buffer.from([0, 200, 120, 40, 90, 60, 20, 0, 90, 60, 20, 200, 120, 40]);
	return Buffer.concat([
		Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
		chunk('IHDR', header),
		chunk('IDAT', deflateSync(rows)),
		chunk('IEND', Buffer.alloc(0))
	]);
}

const MODULES: Record<string, string> = {
	'flask.js': FLASK,
	'throws.js': `export default function build(THREE) {\n  const a = 1;\n  missing.call();\n}\n`,
	'net.js': `export default async function build(THREE) {\n  await fetch('https://example.com/');\n  return new THREE.Group();\n}\n`,
	// The host's bindings: across the sandbox's origin, and on its own window.
	'parent.js': `export default async function build() {\n  return parent.__check3dRead('flask.js');\n}\n`,
	'own.js': `export default async function build() {\n  await window.__check3dRead('flask.js');\n}\n`,
	'loop.js': `export default function build() {\n  while (true) {}\n}\n`,
	'crate.js': `export default function build(THREE, kit) {\n  const map = kit.texture('tex/wood.png');\n  const crate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshStandardMaterial({ map }));\n  crate.name = 'Crate';\n  return crate;\n}\n`
};

let base: string;
let root: string;
let client: Client;

beforeAll(async () => {
	if (!existsSync(CLI)) throw new Error('Run `npm run build` before this test.');
	base = mkdtempSync(join(tmpdir(), 'check-3d-server-'));
	root = join(base, 'root');
	mkdirSync(root);
	for (const [name, source] of Object.entries(MODULES)) writeFileSync(join(root, name), source);
	mkdirSync(join(root, 'tex'));
	writeFileSync(join(root, 'tex', 'wood.png'), png());
	writeFileSync(join(base, 'outside.js'), FLASK);
	client = new Client({ name: 'test', version: '0' });
	await client.connect(
		new StdioClientTransport({
			command: process.execPath,
			args: [CLI, '--root', root],
			env: { ...process.env, CHECK_3D_TIMEOUT_MS: '8000' } as Record<string, string>,
			stderr: 'inherit'
		})
	);
});

afterAll(async () => {
	await client?.close();
	rmSync(base, { recursive: true, force: true });
});

async function call(args: Record<string, unknown>) {
	const r = (await client.callTool({ name: 'check_3d', arguments: args }, undefined, {
		timeout: 60_000
	})) as CallToolResult;
	const text = r.content.flatMap((c) => (c.type === 'text' ? [c.text] : [])).join('\n');
	const images = r.content.filter((c) => c.type === 'image');
	return { isError: !!r.isError, text, images };
}

describe('check_3d over MCP', () => {
	it('lists one tool with the shared schema', async () => {
		const { tools } = await client.listTools();
		expect(tools.map((t) => t.name)).toEqual(['check_3d']);
		expect(Object.keys(tools[0].inputSchema.properties ?? {})).toContain('clips');
	});

	it('builds a module, writes its GLB and returns the sheet', async () => {
		const r = await call({ path: 'flask.js' });
		expect(r.isError).toBe(false);
		expect(r.text).toMatch(/^Wrote flask\.glb\./);
		expect(r.text).toContain('1 meshes');
		expect(r.images).toHaveLength(1);
		expect(r.images[0]).toMatchObject({ mimeType: 'image/png' });
		expect(readFileSync(join(root, 'flask.glb')).subarray(0, 4).toString()).toBe('glTF');
	});

	it('decodes a PNG the module names and embeds it in the GLB', async () => {
		const r = await call({ path: 'crate.js' });
		expect(r.text).toMatch(/^Wrote crate\.glb\./);
		expect(readFileSync(join(root, 'crate.glb')).toString('latin1')).toContain('image/png');
	});

	it('checks a .glb without writing it', async () => {
		const r = await call({ path: 'flask.glb' });
		expect(r.text).toMatch(/^Checked flask\.glb \(nothing written\)\./);
	});

	it("names the line of the module's error", async () => {
		const r = await call({ path: 'throws.js' });
		expect(r.text).toContain('The check failed.');
		expect(r.text).toMatch(/line 3: .*missing/);
	});

	it('gives a module no network', async () => {
		const r = await call({ path: 'net.js' });
		expect(r.text).toContain('The check failed.');
		expect(r.text).toMatch(/Failed to fetch/);
	});

	it("keeps a module away from the host's files", async () => {
		const across = await call({ path: 'parent.js' });
		expect(across.text).toMatch(/cross-origin/);
		const own = await call({ path: 'own.js' });
		expect(own.text).toContain('- Refused.');
	});

	it('reads and writes nothing outside the root', async () => {
		const read = await call({ path: '../outside.js' });
		expect(read).toMatchObject({ isError: true });
		expect(read.text).toMatch(/outside/);
		const write = await call({ path: 'flask.js', out: '../escape.glb' });
		expect(write).toMatchObject({ isError: true });
		expect(existsSync(join(base, 'escape.glb'))).toBe(false);
	});

	it('stops a module that never returns, then carries on', async () => {
		const r = await call({ path: 'loop.js' });
		expect(r).toMatchObject({ isError: true });
		expect(r.text).toMatch(/was stopped/);
		expect((await call({ path: 'flask.js' })).text).toMatch(/^Wrote flask\.glb\./);
	});
});
