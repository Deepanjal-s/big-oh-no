import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts', 'src/vitest.ts', 'src/jest.ts'],
	format: ['esm', 'cjs'],
	dts: true,
	clean: true,
	target: 'node18',
	external: ['vitest'],
});
