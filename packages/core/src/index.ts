/**
 * The 3D model checker: run `check_3d` in a browser page with `runCheck3d`
 * and a `Check3dHost`, or use the pieces directly. Deeper modules are at
 * `3d_model_checker_core/glb/*` and `3d_model_checker_core/three/*`, and the
 * kit a build module's frame loads is `3d_model_checker_core/three-kit.js`.
 */
export {
	CHECK_3D_DESCRIPTION,
	CHECK_3D_PARAMETERS,
	runCheck3d,
	type Check3dHost,
	type Check3dReply
} from './three/call.ts';
export {
	LATE_MS,
	type FrameControl,
	type FrameOptions,
	type FrameRunner,
	type RunError
} from './three/frame.ts';
export { runSrcdocFrame } from './three/srcdocFrame.ts';
export { threeKitUrl } from './three/kitUrl.ts';
export { checkGlb, type CheckOptions, type GlbCheck } from './glb/check.ts';
export { MOTION_NOTE, SHEET_NOTE, closeUpNote } from './three/load.ts';
export { check3dFile } from './three/output.ts';
