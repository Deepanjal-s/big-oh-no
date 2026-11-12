import { describe, expect, it } from 'vitest';
import '../src/vitest.js';
import {
	assertComplexity,
	ComplexityError,
	checkComplexity,
	estimateComplexity,
} from '../src/index.js';

const range = (n: number) => Array.from({ length: n }, (_, i) => (i * 2654435761) % 1_000_003);

function sum(xs: number[]) {
	let s = 0;
	for (const x of xs) s += x;
	return s;
}

function countDuplicatePairs(xs: number[]) {
	let c = 0;
	for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (xs[i] === xs[j]) c++;
	return c;
}

function hasDuplicate(xs: number[]) {
	const seen = new Set<number>();
	for (const x of xs) {
		if (seen.has(x)) return true;
		seen.add(x);
	}
	return false;
}

describe('real measurements', () => {
	it('passes a linear loop as O(n)', async () => {
		await expect(sum).toBeLinear(range);
	});

	it('fails a nested loop against O(n)', async () => {
		await expect(countDuplicatePairs).not.toHaveComplexity('O(n)', range);
	});

	it('passes a nested loop as O(n^2)', async () => {
		await expect(countDuplicatePairs).toHaveComplexity('O(n^2)', range);
	});

	it('passes Array#sort as O(n log n)', async () => {
		await expect((xs: number[]) => xs.sort((a, b) => a - b)).toHaveComplexity('O(n log n)', range);
	});

	it('passes a Set-based check as O(n)', async () => {
		// Explicit sizes keep the Set small enough to stay in CPU cache. With
		// millions of entries cache misses make each insert slower, which shows
		// up (correctly) as faster-than-linear growth on some machines.
		await expect(hasDuplicate).toHaveComplexity('linear', range, {
			sizes: [10_000, 20_000, 40_000, 80_000, 160_000],
			reps: 9,
		});
	});

	it('passes a Map lookup as O(1)', async () => {
		const map = new Map(range(200_000).map((v, i) => [i, v]));
		// The "input" here is just how many lookups we skip past; work is constant.
		await expect((n: number) => map.get(n % 200_000)).toBeConstant((n) => n, {
			sizes: [1e3, 1e4, 1e5, 1e6],
			reps: 50,
			tolerance: 0.5,
		});
	});

	it('measures async functions', async () => {
		const asyncSum = async (xs: number[]) => sum(xs);
		await expect(asyncSum).toBeLinear(range);
	});

	it('estimates the class of unknown code', async () => {
		const est = await estimateComplexity(countDuplicatePairs, range);
		expect(est.bestFit).toBe('O(n^2)');
		expect(est.exponent).toBeGreaterThan(1.7);
	});

	it('throws a readable ComplexityError', async () => {
		const err = await assertComplexity(countDuplicatePairs, range, 'O(n)', { retries: 0 }).catch((e) => e);
		expect(err).toBeInstanceOf(ComplexityError);
		expect(err.message).toMatch(/countDuplicatePairs grows faster than O\(n\): it looks like O\(n\^[23]\)/);
		expect(err.message).toMatch(/growth/);
		expect(err.report.analysis.samples.length).toBeGreaterThanOrEqual(3);
	});

	it('respects explicit sizes', async () => {
		const report = await checkComplexity(sum, range, 'O(n)', { sizes: [1e5, 2e5, 4e5, 8e5] });
		expect(report.analysis.samples.map((s) => s.n)).toEqual([1e5, 2e5, 4e5, 8e5]);
	});

	it('stays within the time budget on slow code', async () => {
		const t0 = performance.now();
		const report = await checkComplexity(countDuplicatePairs, range, 'O(n^2)', {
			budgetMs: 1500,
			retries: 0,
		});
		expect(performance.now() - t0).toBeLessThan(4000);
		expect(report.analysis.samples.length).toBeGreaterThanOrEqual(3);
	});

	it('gives a clear error for bad arguments', async () => {
		await expect(checkComplexity(sum, range, 'O(n!)')).rejects.toThrow(/Use one of/);
		// @ts-expect-error makeInput is required
		await expect(checkComplexity(sum, undefined, 'O(n)')).rejects.toThrow(/input generator/);
	});
});
