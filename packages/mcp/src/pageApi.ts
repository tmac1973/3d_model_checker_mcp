/** What the headless page's script (`page/entry.ts`) and the server share. */
import type { Check3dReply } from '3d_model_checker_core';

declare global {
	interface Window {
		/** A file's bytes as base64; rejects with the reason it can't be read. */
		__check3dRead(path: string): Promise<string>;
		/** Write a GLB given as base64; the refusal, or null. */
		__check3dWrite(path: string, base64: string): Promise<string | null>;
		/** Run one call against `root`. */
		check3d(args: Record<string, unknown>, root: string): Promise<Check3dReply>;
	}
}

export {};
