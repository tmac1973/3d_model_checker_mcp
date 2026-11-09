#!/usr/bin/env node
import { serve } from './server.ts';

serve(process.argv.slice(2)).catch((e) => {
	console.error(e instanceof Error ? e.message : e);
	process.exit(1);
});
