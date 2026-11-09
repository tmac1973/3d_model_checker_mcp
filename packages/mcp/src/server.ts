/**
 * `3d_model_checker_mcp`: an MCP server over stdio with one tool, `check_3d`.
 * Paths are relative to the root folder (`--root`, default the working
 * directory); nothing outside it is read or written.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
	type CallToolResult
} from '@modelcontextprotocol/sdk/types.js';
import {
	CHECK_3D_DESCRIPTION,
	CHECK_3D_PARAMETERS,
	type Check3dReply
} from '3d_model_checker_core';
import { Checker } from './browser.ts';
import { rootFiles } from './files.ts';

const VERSION = '0.1.0';

/** `check_3d`'s schema, with paths described as this server takes them. */
const PARAMETERS = {
	...CHECK_3D_PARAMETERS,
	properties: {
		...CHECK_3D_PARAMETERS.properties,
		path: {
			type: 'string',
			description:
				"A .js/.mjs build module, or a .glb/.gltf file, relative to the server's root folder."
		}
	}
};

/** The root folder from `--root <dir>` or `--root=<dir>`, else the working directory. */
export function rootArg(argv: string[]): string {
	const i = argv.findIndex((a) => a === '--root' || a.startsWith('--root='));
	if (i < 0) return process.cwd();
	const value = argv[i].startsWith('--root=') ? argv[i].slice('--root='.length) : argv[i + 1];
	if (!value) throw new Error('--root needs a folder.');
	return value;
}

/** A reply as MCP content: the text, then the sheet as an image. */
export function toResult(reply: Check3dReply): CallToolResult {
	if ('error' in reply) return { isError: true, content: [{ type: 'text', text: reply.error }] };
	const content: CallToolResult['content'] = [{ type: 'text', text: reply.text }];
	const png = reply.png?.match(/^data:image\/png;base64,(.+)$/)?.[1];
	if (png) content.push({ type: 'image', data: png, mimeType: 'image/png' });
	return { content };
}

/** Serve `check_3d` over stdio until the client goes away. */
export async function serve(argv: string[]): Promise<void> {
	const files = await rootFiles(rootArg(argv));
	const timeout = Number(process.env.CHECK_3D_TIMEOUT_MS);
	const checker = new Checker(files, timeout > 0 ? timeout : undefined);
	const server = new Server(
		{ name: '3d_model_checker_mcp', version: VERSION },
		{ capabilities: { tools: {} } }
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [{ name: 'check_3d', description: CHECK_3D_DESCRIPTION, inputSchema: PARAMETERS }]
	}));

	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		if (request.params.name !== 'check_3d') {
			return {
				isError: true,
				content: [{ type: 'text', text: `No tool ${request.params.name}.` }]
			};
		}
		try {
			return toResult(await checker.run(request.params.arguments ?? {}));
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			return { isError: true, content: [{ type: 'text', text: message }] };
		}
	});

	const stop = async () => {
		await checker.close();
		process.exit(0);
	};
	process.on('SIGINT', stop);
	process.on('SIGTERM', stop);
	process.stdin.on('close', stop);

	await server.connect(new StdioServerTransport());
}
