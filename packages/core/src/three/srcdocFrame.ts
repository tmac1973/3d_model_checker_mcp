/**
 * A `FrameRunner` for any browser page: the HTML goes in a sandboxed,
 * off-screen iframe as `srcdoc`, so it gets an opaque origin that reaches
 * neither the page nor its storage. The page itself decides what the frame
 * may load (its CSP, or the host's network rules); the MCP server's page
 * allows only the kit.
 */
import type { FrameControl, FrameOptions, FrameRunner } from './frame.ts';

export const runSrcdocFrame: FrameRunner = (html, opts) => {
	opts.signal?.throwIfAborted();
	return new Promise((resolve, reject) => {
		new SrcdocFrame(opts, resolve, reject).start(html);
	});
};

class SrcdocFrame implements FrameControl {
	private readonly timers = new Set<ReturnType<typeof setTimeout>>();
	private readonly iframe = document.createElement('iframe');
	private deadline: ReturnType<typeof setTimeout> | undefined;
	private ended = false;

	constructor(
		private readonly opts: FrameOptions,
		private readonly resolve: () => void,
		private readonly reject: (e: unknown) => void
	) {}

	start(html: string) {
		this.deadline = this.timer(this.opts.timeoutMs, () => this.opts.onTimeout(this));
		window.addEventListener('message', this.onMessage);
		this.opts.signal?.addEventListener('abort', this.onAbort, { once: true });

		const f = this.iframe;
		f.setAttribute('sandbox', 'allow-scripts');
		f.setAttribute('aria-hidden', 'true');
		f.tabIndex = -1;
		f.style.cssText =
			'position: fixed; left: -10000px; top: 0; width: 1024px; height: 768px; border: 0';
		f.srcdoc = html;
		document.body.appendChild(f);
	}

	private timer(ms: number, fn: () => void) {
		const t = setTimeout(() => {
			this.timers.delete(t);
			fn();
		}, ms);
		this.timers.add(t);
		return t;
	}

	post(message: unknown) {
		this.iframe.contentWindow?.postMessage(message, '*');
	}

	later(ms: number, fn: () => void) {
		if (!this.ended) this.timer(ms, fn);
	}

	clearDeadline() {
		if (this.deadline === undefined) return;
		clearTimeout(this.deadline);
		this.timers.delete(this.deadline);
		this.deadline = undefined;
	}

	private cleanup() {
		this.ended = true;
		for (const t of this.timers) clearTimeout(t);
		this.timers.clear();
		window.removeEventListener('message', this.onMessage);
		this.opts.signal?.removeEventListener('abort', this.onAbort);
		this.iframe.remove();
	}

	done() {
		if (this.ended) return;
		this.cleanup();
		this.resolve();
	}

	private readonly onAbort = () => {
		this.cleanup();
		this.reject(new DOMException('The run was aborted.', 'AbortError'));
	};

	private readonly onMessage = (event: MessageEvent) => {
		if (event.source !== this.iframe.contentWindow || this.ended) return;
		const data = event.data as Record<string, unknown> | null;
		if (!data || typeof data !== 'object') return;
		this.opts.onMessage(data, this);
	};
}
