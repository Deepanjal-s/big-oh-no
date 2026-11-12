import { describe, expect, it } from 'vitest';
import { analyze, judge, normalizeComplexity, type Sample } from '../src/analyze.js';

const sizes = [1000, 2000, 4000, 8000, 16000];

/** Deterministic pseudo-random noise so the tests never flake. */
function noisy(seed: number) {
	let s = seed;
	return (spread: number) => {
		s = (s * 1103515245 + 12345) % 2 ** 31;
		return 1 + ((s / 2 ** 31) * 2 - 1) * spread;
	};
}

function samples(f: (n: number) => number, spread = 0, seed = 7): Sample[] {
	const r = noisy(seed);
	return sizes.map((n) => ({ n, ms: f(n) * r(spread) }));
}

describe('analyze', () => {
	it.each([
		['O(1)', () => 3, 0],
		['O(n)', (n: number) => n / 1000, 1],
		['O(n^2)', (n: number) => (n / 1000) ** 2, 2],
		['O(n^3)', (n: number) => (n / 1000) ** 3, 3],
	])('measures the exponent of %s data', (_, f, exponent) => {
		expect(analyze(samples(f)).exponent).toBeCloseTo(exponent, 5);
	});

	it.each([
		['O(1)', () => 3],
		['O(log n)', (n: number) => Math.log2(n)],
		['O(n)', (n: number) => n / 1000],
		['O(n log n)', (n: number) => (n * Math.log2(n)) / 1000],
		['O(n^2)', (n: number) => (n / 1000) ** 2],
		['O(n^3)', (n: number) => (n / 1000) ** 3],
	])('classifies clean %s data', (name, f) => {
		expect(analyze(samples(f)).bestFit).toBe(name);
	});

	// With noise, a log factor is within measurement error over a 16× range,
	// so neighbours like O(n) / O(n log n) may swap. Polynomial degree must not.
	it.each([
		['O(1)', () => 3, ['O(1)', 'O(log n)']],
		['O(n)', (n: number) => n / 1000, ['O(n)', 'O(n log n)']],
		['O(n^2)', (n: number) => (n / 1000) ** 2, ['O(n^2)']],
		['O(n^3)', (n: number) => (n / 1000) ** 3, ['O(n^3)']],
	])('never confuses polynomial degree for %s data with ±15%% noise', (_, f, allowed) => {
		for (let seed = 1; seed <= 50; seed++) {
			expect(allowed).toContain(analyze(samples(f, 0.15, seed)).bestFit);
		}
	});

	it('handles a fixed overhead on top of linear work', () => {
		// 5 ms of setup plus linear work: still linear, not constant.
		const a = analyze(samples((n) => 5 + n / 100));
		expect(a.bestFit).toBe('O(n)');
	});

	it('reports per-step growth ratios', () => {
		const a = analyze(samples((n) => (n / 1000) ** 2));
		for (const r of a.stepRatios) expect(r).toBeCloseTo(4, 5);
	});

	it('sorts unordered samples and ignores invalid ones', () => {
		const a = analyze([
			{ n: 4000, ms: 4 },
			{ n: 1000, ms: 1 },
			{ n: 0, ms: 1 },
			{ n: 2000, ms: 2 },
			{ n: 8000, ms: Number.NaN },
		]);
		expect(a.samples.map((s) => s.n)).toEqual([1000, 2000, 4000]);
		expect(a.exponent).toBeCloseTo(1, 5);
	});

	it('needs at least 3 samples', () => {
		expect(() => analyze([{ n: 1, ms: 1 }, { n: 2, ms: 2 }])).toThrow(RangeError);
	});
});

describe('judge', () => {
	const quadratic = analyze(samples((n) => (n / 1000) ** 2, 0.1));
	const linear = analyze(samples((n) => n / 1000, 0.1));
	const nlogn = analyze(samples((n) => (n * Math.log2(n)) / 1000, 0.1));

	it('fails quadratic code against O(n)', () => {
		expect(judge(quadratic, 'O(n)').pass).toBe(false);
	});

	it('passes linear code against O(n)', () => {
		expect(judge(linear, 'O(n)').pass).toBe(true);
	});

	it('treats the expected class as an upper bound', () => {
		expect(judge(linear, 'O(n^2)').pass).toBe(true);
		expect(judge(linear, 'O(1)').pass).toBe(false);
	});

	it('passes n log n against O(n log n) but fails it against nothing stricter than O(n)', () => {
		expect(judge(nlogn, 'O(n log n)').pass).toBe(true);
		expect(judge(nlogn, 'O(1)').pass).toBe(false);
	});

	it('respects a custom tolerance', () => {
		expect(judge(linear, 'O(1)', 1.5).pass).toBe(true);
	});
});

describe('normalizeComplexity', () => {
	it.each([
		['O(n)', 'O(n)'],
		['linear', 'O(n)'],
		['o(N)', 'O(n)'],
		['O(n²)', 'O(n^2)'],
		['quadratic', 'O(n^2)'],
		['O(nlogn)', 'O(n log n)'],
		['  O( n log n ) ', 'O(n log n)'],
		['constant', 'O(1)'],
	])('reads %s', (input, expected) => {
		expect(normalizeComplexity(input)).toBe(expected);
	});

	it('rejects unknown names with the list of valid ones', () => {
		expect(() => normalizeComplexity('O(n!)')).toThrow(/Use one of/);
	});
});
