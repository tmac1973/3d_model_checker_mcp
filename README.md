# 3D model checker

An MCP server that lets a coding agent see the 3D models it makes.

It has one tool, `check_3d`. Give it a Three.js build module and it builds the model, exports a GLB and hands back a report and a six-view render sheet (front, right, back, left, top and three-quarter, over a floor grid). Give it a `.glb` from anywhere else, Blender included, and you get the same report and sheet without anything being written.

The report covers size, parts, triangle counts, materials, glTF validation in plain words, and a check of every animation clip: feet that slide, limbs that pass through the floor, loops that don't close. Ask for one clip and the sheet shows it moving. Ask for one part and it frames that part close up.

It needs no model and no network. It started as the 3D helper in [Haruspex](https://github.com/tmac1973/haruspex), which still uses the same core.

## Setup

You need Node 22 or newer and a Chromium. The server looks for one in this order:

1. `CHECK_3D_BROWSER`, if you set it to a Chromium or Chrome binary.
2. Playwright's own Chromium. Install it with `npx playwright install chromium`.
3. An installed Google Chrome.

Rendering uses SwiftShader, so it works on a machine with no GPU.

Until the packages are on npm, build from a checkout:

```bash
npm install
npm run build
```

### Claude Code

```bash
claude mcp add check-3d -- node /path/to/3d_model_checker_mcp/packages/mcp/dist/cli.js --root /path/to/your/project
```

### Any other client

Most clients take a stdio server in a JSON block like this:

```json
{
	"mcpServers": {
		"check-3d": {
			"command": "node",
			"args": [
				"/path/to/3d_model_checker_mcp/packages/mcp/dist/cli.js",
				"--root",
				"/path/to/your/project"
			]
		}
	}
}
```

`--root` is the folder the tool can see. Paths in calls are relative to it, and nothing outside it is read or written. Leave it out and the server uses the folder it was started in.

## Writing a build module

A module imports nothing. Its default export gets `THREE` and a small kit, and returns an `Object3D`, or `{ object, animations }` when it has clips:

```js
export default function build(THREE, kit) {
	const asset = new THREE.Group();
	const glass = new THREE.MeshStandardMaterial({ color: 0x4aa8e0 });
	const pts = [
		[0, 0],
		[0.12, 0.02],
		[0.15, 0.1],
		[0.05, 0.22],
		[0.04, 0.3]
	].map(([x, y]) => new THREE.Vector2(x, y));
	const flask = new THREE.Mesh(new THREE.LatheGeometry(pts, 10), glass);
	flask.name = 'Flask';
	asset.add(flask);
	return asset;
}
```

Units are metres, y is up and the front faces +z. The tool's description tells the agent the rest: the kit, animation modules, textures and the arguments for clips, close-ups and normalising a GLB.

## What it doesn't do

- It doesn't make models. The agent writes the module; this builds it and shows the result.
- It runs one call at a time. A second call waits for the first.
- It doesn't follow a `.gltf` that points at files beside it. Export a `.glb`, or embed the buffers.
- A module gets no network and can't read files, apart from PNG textures next to it that it names with `kit.texture`.

## How it works

Everything runs in one headless Chromium page, because the render sheets need WebGL. The page lives on a made-up origin that only the server answers, so the only things it can load are its own script and the three.js kit. Build modules run in a sandboxed iframe inside that page, with an opaque origin. Files reach the page through two bindings that only the page's own frame may call. A call that runs past 180 seconds (`CHECK_3D_TIMEOUT_MS`) is stopped and its browser replaced, since a module stuck in a loop freezes the page.

## Packages

- `packages/core`, `3d_model_checker_core`: the checks, the render sheets and the module runner. It runs in any browser page, given a `Check3dHost` for files and a sandboxed frame. Haruspex hosts it in its webview.
- `packages/mcp`, `3d_model_checker_mcp`: the server.

## Development

```bash
npm run build         # both packages; the server's tests use the build
npm test
npm run check         # TypeScript
npm run format:check
```

## Licence

MIT. See `LICENSE`.
