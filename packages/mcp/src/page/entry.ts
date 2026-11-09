/**
 * The headless page's script: the whole `check_3d` call runs here, since the
 * render sheets need WebGL and the loader needs `createImageBitmap`. Files
 * come and go through two bindings the server exposes to this frame only
 * (`browser.ts`); build modules run in a sandboxed `srcdoc` frame inside it.
 */
import { runCheck3d, runSrcdocFrame } from '3d_model_checker_core';
import '../pageApi.ts';

function fromBase64(base64: string): number[] {
	const binary = atob(base64);
	const out = new Array<number>(binary.length);
	for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
	return out;
}

function toBase64(bytes: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < bytes.length; i += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

window.check3d = (args, root) =>
	runCheck3d(args, {
		read: async (path) => fromBase64(await window.__check3dRead(path)),
		write: (path, bytes) => window.__check3dWrite(path, toBase64(bytes)),
		cwd: root,
		runFrame: runSrcdocFrame,
		// The reply always carries the sheet as an image.
		attachSheet: () => true
	});
