import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { rootFiles, type RootFiles } from './files.ts';

let base: string;
let root: string;
let files: RootFiles;

beforeEach(async () => {
	base = mkdtempSync(join(tmpdir(), 'check-3d-files-'));
	root = join(base, 'root');
	mkdirSync(root);
	writeFileSync(join(root, 'a.js'), 'inside');
	writeFileSync(join(base, 'secret.js'), 'outside');
	mkdirSync(join(base, 'elsewhere'));
	files = await rootFiles(root);
});

afterEach(() => rmSync(base, { recursive: true, force: true }));

const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

describe('read', () => {
	it('reads a file in the root, relative or absolute', async () => {
		expect(text(await files.read('a.js'))).toBe('inside');
		expect(text(await files.read(join(root, 'a.js')))).toBe('inside');
	});

	it('refuses a path above the root whether or not it exists', async () => {
		await expect(files.read('../nope.js')).rejects.toThrow(/outside/);
		await expect(files.read('../secret.js')).rejects.toThrow(/outside/);
		await expect(files.read(join(base, 'secret.js'))).rejects.toThrow(/outside/);
	});

	it('refuses a symlink in the root that points out of it', async () => {
		symlinkSync(join(base, 'secret.js'), join(root, 'link.js'));
		await expect(files.read('link.js')).rejects.toThrow(/outside/);
	});

	it('follows a symlink that stays in the root', async () => {
		symlinkSync(join(root, 'a.js'), join(root, 'b.js'));
		expect(text(await files.read('b.js'))).toBe('inside');
	});

	it('says when there is no such file', async () => {
		await expect(files.read('nope.js')).rejects.toThrow(/No such file/);
	});
});

describe('write', () => {
	const glb = new Uint8Array([103, 108, 84, 70]);

	it('writes a .glb, making its folders', async () => {
		expect(await files.write('models/new/a.glb', glb)).toBeNull();
		expect([...readFileSync(join(root, 'models/new/a.glb'))]).toEqual([...glb]);
	});

	it('writes only .glb files', async () => {
		expect(await files.write('a.js', glb)).toMatch(/Only \.glb/);
	});

	it('refuses a path above the root', async () => {
		expect(await files.write('../x.glb', glb)).toMatch(/outside/);
		expect(await files.write(join(base, 'x.glb'), glb)).toMatch(/outside/);
	});

	it('refuses a folder in the root that links out of it', async () => {
		symlinkSync(join(base, 'elsewhere'), join(root, 'out'));
		expect(await files.write('out/x.glb', glb)).toMatch(/outside/);
		expect(await files.write('out/deeper/x.glb', glb)).toMatch(/outside/);
	});

	it('refuses to write through a symlinked file', async () => {
		symlinkSync(join(base, 'secret.js'), join(root, 'a.glb'));
		expect(await files.write('a.glb', glb)).toMatch(/symlink/);
		expect(readFileSync(join(base, 'secret.js'), 'utf8')).toBe('outside');
	});
});
