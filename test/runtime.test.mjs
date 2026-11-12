// Runtime smoke test of the built package with node:test only, so it can run
// on old Node versions that the dev tooling (Vitest, tsup) no longer supports.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { assertComplexity, ComplexityError, estimateComplexity } from 'big-oh-no';

const range = (n) => Array.from({ length: n }, (_, i) => i);
const pairs = (xs) => {
	let c = 0;
	for (const a of xs) for (const b of xs) if (a === b) c++;
	return c;
};

test('ESM build: linear passes', async () => {
	await assertComplexity((xs) => xs.indexOf(-1), range, 'O(n)');
});

test('ESM build: quadratic is caught', async () => {
	await assert.rejects(assertComplexity(pairs, range, 'O(n)', { retries: 0 }), ComplexityError);
});

test('ESM build: estimate', async () => {
	const r = await estimateComplexity(pairs, range);
	assert.ok(r.exponent > 1.6, `exponent ${r.exponent}`);
});

test('CJS build loads', () => {
	const cjs = createRequire(import.meta.url)('big-oh-no');
	assert.equal(typeof cjs.assertComplexity, 'function');
});
