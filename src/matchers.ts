import type { Complexity } from './analyze.js';
import { type ComplexityOptions, checkComplexity, formatFailure, formatPass } from './assert.js';
import type { MakeInput } from './measure.js';

interface MatcherContext {
	isNot?: boolean;
}

interface MatcherResult {
	pass: boolean;
	message: () => string;
}

async function run(
	ctx: MatcherContext,
	received: unknown,
	expected: Complexity | string,
	makeInput: MakeInput<unknown>,
	options: ComplexityOptions = {},
): Promise<MatcherResult> {
	if (typeof received !== 'function') {
		throw new TypeError(
			`big-oh-no: expect(...) must receive the function to measure, got ${typeof received}`,
		);
	}
	// With .not we want a failure to be real, so don't retry looking for a pass.
	const report = await checkComplexity(
		received as (input: unknown) => unknown,
		makeInput,
		expected,
		ctx.isNot ? { ...options, retries: 0 } : options,
	);
	return {
		pass: report.pass,
		message: () => (report.pass ? formatPass(report) : formatFailure(report)),
	};
}

/** Raw matchers for `expect.extend` in Vitest or Jest. */
export const matchers = {
	/** Passes when the function grows no faster than `expected`, e.g. 'O(n)'. */
	toHaveComplexity(
		this: MatcherContext,
		received: unknown,
		expected: Complexity | string,
		makeInput: MakeInput<unknown>,
		options?: ComplexityOptions,
	) {
		return run(this, received, expected, makeInput, options);
	},
	/** Shorthand for toHaveComplexity('O(n)', ...). */
	toBeLinear(
		this: MatcherContext,
		received: unknown,
		makeInput: MakeInput<unknown>,
		options?: ComplexityOptions,
	) {
		return run(this, received, 'O(n)', makeInput, options);
	},
	/** Shorthand for toHaveComplexity('O(1)', ...). */
	toBeConstant(
		this: MatcherContext,
		received: unknown,
		makeInput: MakeInput<unknown>,
		options?: ComplexityOptions,
	) {
		return run(this, received, 'O(1)', makeInput, options);
	},
};

/** Matcher signatures, shared by the Vitest and Jest type augmentations. */
export interface BigOhNoMatchers<R = unknown> {
	toHaveComplexity<I>(
		expected: Complexity | `${string}`,
		makeInput: MakeInput<I>,
		options?: ComplexityOptions,
	): Promise<R>;
	toBeLinear<I>(makeInput: MakeInput<I>, options?: ComplexityOptions): Promise<R>;
	toBeConstant<I>(makeInput: MakeInput<I>, options?: ComplexityOptions): Promise<R>;
}
