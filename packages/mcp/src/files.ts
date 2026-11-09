/**
 * The server's file access: everything under one root folder, and nothing
 * else. Reads follow symlinks only when they land inside the root; the only
 * writes are .glb files, never through a symlink.
 */
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

/** Whether `path` is `root` or inside it. Both must be real (resolved) paths. */
function inside(root: string, path: string): boolean {
	const rel = relative(root, path);
	return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

/** The nearest folder at or above `path` that exists, resolved. */
async function existingAncestor(path: string): Promise<string> {
	for (let p = path; ; p = dirname(p)) {
		try {
			return await realpath(p);
		} catch {
			if (dirname(p) === p) throw new Error(`No folder exists above ${path}.`);
		}
	}
}

export interface RootFiles {
	root: string;
	/** A file's bytes; throws with a reason the model can act on. */
	read(path: string): Promise<Uint8Array>;
	/** Write a .glb; the refusal, or null. */
	write(path: string, bytes: Uint8Array): Promise<string | null>;
}

/** File access confined to `root`, which must exist. */
export async function rootFiles(rootPath: string): Promise<RootFiles> {
	const root = await realpath(resolve(rootPath));
	const outside = (path: string) => `${path} is outside ${root}.`;

	return {
		root,
		async read(path) {
			const full = resolve(root, path);
			let real: string;
			try {
				real = await realpath(full);
			} catch {
				throw new Error(`No such file: ${path}`);
			}
			if (!inside(root, real)) throw new Error(outside(path));
			return new Uint8Array(await readFile(real));
		},
		async write(path, bytes) {
			const full = resolve(root, path);
			if (!/\.glb$/i.test(full)) return 'Only .glb files can be written.';
			if (!inside(root, await existingAncestor(dirname(full)))) return outside(path);
			try {
				if ((await lstat(full)).isSymbolicLink())
					return `${path} is a symlink; not writing through it.`;
			} catch {
				// Not there yet: fine.
			}
			try {
				await mkdir(dirname(full), { recursive: true });
				if (!inside(root, await realpath(dirname(full)))) return outside(path);
				await writeFile(full, bytes);
				return null;
			} catch (e) {
				return `Could not write ${path}: ${e instanceof Error ? e.message : String(e)}`;
			}
		}
	};
}
