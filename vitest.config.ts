import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['test/**/*.test.ts', 'examples/**/*.test.ts'],
		// Timing tests must not compete with each other for the CPU.
		fileParallelism: false,
		pool: 'forks',
		execArgv: ['--expose-gc'],
		testTimeout: 60_000,
	},
});
