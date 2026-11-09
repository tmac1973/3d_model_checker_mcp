/**
 * The headless Chromium the checks run in. One page, made on the first call
 * and reused; calls take turns. The page lives on a made-up origin that only
 * this process serves: its HTML, the core's bundle and the three.js kit.
 * Every other request is refused, so a build module gets no network.
 */
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from 'playwright-core';
import type { Check3dReply } from '3d_model_checker_core';
import type { RootFiles } from './files.ts';
import './pageApi.ts';

const ORIGIN = 'https://check-3d.invalid';
/** Longer than the core's own 45 s build timeout, for the sheets after it. */
export const CALL_TIMEOUT_MS = 180_000;

const PAGE_HTML =
	'<!doctype html><html><head><meta charset="utf-8"><script src="/page.js"></script></head><body></body></html>';

/** What the page's origin serves, by path. */
async function assets(): Promise<Map<string, { body: Buffer; type: string }>> {
	const require = createRequire(import.meta.url);
	const kit = require.resolve('3d_model_checker_core/three-kit.js');
	const page = join(import.meta.dirname, 'page.js');
	const js = 'text/javascript';
	return new Map([
		['/', { body: Buffer.from(PAGE_HTML), type: 'text/html' }],
		['/page.js', { body: await readFile(page), type: js }],
		// Where the core's `threeKitUrl` looks, on the page's own origin.
		['/helpers/three-kit.js', { body: await readFile(kit), type: js }]
	]);
}

/** Launch Chromium: `CHECK_3D_BROWSER`, else Playwright's, else an installed Chrome. */
async function launch(): Promise<Browser> {
	// SwiftShader gives WebGL with no GPU, which a headless server often lacks.
	const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
	const executablePath = process.env.CHECK_3D_BROWSER;
	if (executablePath) return chromium.launch({ executablePath, args });
	try {
		return await chromium.launch({ args });
	} catch (first) {
		try {
			return await chromium.launch({ channel: 'chrome', args });
		} catch {
			const why = first instanceof Error ? first.message.split('\n')[0] : String(first);
			throw new Error(
				`No Chromium to run in (${why}). Run \`npx playwright install chromium\`, install Chrome, or set CHECK_3D_BROWSER to a Chromium binary.`
			);
		}
	}
}

export class Checker {
	private browser: Browser | null = null;
	private page: Page | null = null;
	private queue: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly files: RootFiles,
		/** How long one call may take before its page is thrown away. */
		private readonly timeoutMs = CALL_TIMEOUT_MS
	) {}

	/** Run one call, after any before it. */
	run(args: Record<string, unknown>): Promise<Check3dReply> {
		const next = this.queue.then(() => this.call(args));
		this.queue = next.catch(() => undefined);
		return next;
	}

	async close(): Promise<void> {
		const browser = this.browser;
		this.browser = this.page = null;
		await browser?.close();
	}

	private async call(args: Record<string, unknown>): Promise<Check3dReply> {
		const page = await this.ready();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(
				() =>
					reject(
						new Error(
							`The check took over ${this.timeoutMs / 1000} s and was stopped. Look for a loop in the module that never ends.`
						)
					),
				this.timeoutMs
			);
		});
		try {
			return await Promise.race([
				page.evaluate(([a, root]) => window.check3d(a, root), [args, this.files.root] as const),
				timeout
			]);
		} catch (e) {
			// A page that hung or crashed is not reused, nor its renderer, which a
			// module stuck in a loop keeps busy: the next call gets a new browser.
			await this.close().catch(() => undefined);
			throw e;
		} finally {
			clearTimeout(timer);
		}
	}

	private async ready(): Promise<Page> {
		if (this.page && !this.page.isClosed()) return this.page;
		if (!this.browser?.isConnected()) this.browser = await launch();
		const served = await assets();
		const context = await this.browser.newContext({ serviceWorkers: 'block' });
		await context.route('**/*', (route) => {
			const url = new URL(route.request().url());
			const asset = url.origin === ORIGIN ? served.get(url.pathname) : undefined;
			if (!asset) return route.abort('blockedbyclient');
			return route.fulfill({ body: asset.body, contentType: asset.type });
		});
		const page = await context.newPage();
		// Only the page's own frame may reach the files; build modules run in a
		// sandboxed frame inside it and get refused.
		const mine = (frame: unknown) => frame === page.mainFrame();
		await page.exposeBinding('__check3dRead', async ({ frame }, path: string) => {
			if (!mine(frame)) throw new Error('Refused.');
			return Buffer.from(await this.files.read(path)).toString('base64');
		});
		await page.exposeBinding('__check3dWrite', async ({ frame }, path: string, b64: string) => {
			if (!mine(frame)) return 'Refused.';
			return this.files.write(path, Buffer.from(b64, 'base64'));
		});
		await page.goto(`${ORIGIN}/`);
		await page.waitForFunction(() => typeof window.check3d === 'function');
		this.page = page;
		return page;
	}
}
