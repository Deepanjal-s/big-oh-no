import { performance } from 'node:perf_hooks';
import type { Sample } from './analyze.js';

export interface MeasureOptions {
	/**
	 * Explicit sizes to measure. When set, calibration is skipped.
	 * Use at least 3 sizes spanning at least 8× (e.g. [1e3, 2e3, 4e3, 8e3]).
	 */
	sizes?: number[];
	/** First size tried during calibration. Default 16. */
	startN?: number;
	/** Largest size calibration may reach. Default 10_000_000. */
	maxN?: number;
	/**
	 * Calibration grows n until one call takes at least this long, so timer
	 * noise is small next to the work being measured. Default 2 ms.
	 */
	minTimeMs?: number;
	/** How many sizes to measure after calibration. Default 5 (a 16× range). */
	steps?: number;
	/** Multiplier between consecutive sizes. Default 2. */
	factor?: number;
	/** Timed runs per size; the fastest one is kept. Default 5. */
	reps?: number;
	/** Soft cap on total measuring time, in ms. Default 5000. */
	budgetMs?: number;
}

const DEFAULTS = {
	startN: 16,
	maxN: 10_000_000,
	minTimeMs: 2,
	steps: 5,
	factor: 2,
	reps: 5,
	budgetMs: 5000,
};

export type Fn<I> = (input: I) => unknown;
export type MakeInput<I> = (n: number) => I | Promise<I>;

// Results are stored here so the JIT can't prove the call is dead code.
let sink: unknown;
export function __sink(): unknown {
	return sink;
}

const gc: (() => void) | undefined =
	typeof (globalThis as { gc?: () => void }).gc === 'function'
		? (globalThis as { gc: () => void }).gc
		: undefined;

async function timeOnce<I>(fn: Fn<I>, input: I): Promise<number> {
	const t0 = performance.now();
	const out = fn(input);
	if (out && typeof (out as PromiseLike<unknown>).then === 'function') {
		sink = await out;
	} else {
		sink = out;
	}
	return performance.now() - t0;
}

async function timeSize<I>(fn: Fn<I>, makeInput: MakeInput<I>, n: number, reps: number) {
	// Inputs are built up front so their cost is never timed, and each run
	// gets a fresh one in case fn mutates it (sorting in place, etc.).
	const inputs: I[] = [];
	for (let i = 0; i < reps; i++) inputs.push(await makeInput(n));
	gc?.();
	let best = Number.POSITIVE_INFINITY;
	for (const input of inputs) {
		const t = await timeOnce(fn, input);
		if (t < best) best = t;
	}
	return best;
}

export interface Measurement {
	samples: Sample[];
	/** Notes about anything that may make the result less trustworthy. */
	warnings: string[];
}

export async function measure<I>(
	fn: Fn<I>,
	makeInput: MakeInput<I>,
	options: MeasureOptions = {},
): Promise<Measurement> {
	const o = { ...DEFAULTS, ...options };
	const warnings: string[] = [];
	const started = performance.now();

	// Warm up the JIT on a small input so the first size isn't penalised.
	for (let i = 0; i < 3; i++) await timeOnce(fn, await makeInput(o.sizes?.[0] ?? o.startN));

	let sizes: number[];
	if (o.sizes) {
		sizes = [...new Set(o.sizes.map((s) => Math.round(s)))].sort((a, b) => a - b);
		if (sizes.length < 3) throw new RangeError('big-oh-no: `sizes` needs at least 3 distinct values');
	} else {
		let n = Math.max(1, Math.round(o.startN));
		for (;;) {
			const t = await timeSize(fn, makeInput, n, 2);
			if (t >= o.minTimeMs || n >= o.maxN) break;
			// Jump faster while far from the target, then double.
			const grow = t < o.minTimeMs / 16 ? 8 : 2;
			n = Math.min(o.maxN, n * grow);
		}
		sizes = [];
		for (let i = 0; i < o.steps; i++) sizes.push(Math.round(n * o.factor ** i));
	}

	// Pass 1: one run per size, smallest first. Predict each next size's cost
	// from the growth so far and stop early rather than blow the budget
	// (always keeping at least 3 sizes).
	const best: number[] = [];
	for (const n of sizes) {
		if (best.length >= 3) {
			const last = best[best.length - 1];
			const ratio = Math.max(1, last / best[best.length - 2]);
			const predicted = last * ratio * o.reps;
			if (performance.now() - started + predicted > o.budgetMs) {
				warnings.push(`Stopped after ${best.length} sizes to stay within budgetMs=${o.budgetMs}.`);
				break;
			}
		}
		best.push(await timeSize(fn, makeInput, n, 1));
	}
	const kept = sizes.slice(0, best.length);

	// Remaining runs go round-robin across sizes, so a burst of background
	// load (a busy CI machine) slows every size alike instead of skewing one.
	for (let r = 1; r < o.reps; r++) {
		for (let i = 0; i < kept.length; i++) {
			const t = await timeSize(fn, makeInput, kept[i], 1);
			if (t < best[i]) best[i] = t;
		}
	}
	const samples: Sample[] = kept.map((n, i) => ({ n, ms: Math.max(best[i], 1e-6) }));

	const smallest = samples[0];
	if (smallest && smallest.ms < 0.05) {
		warnings.push(
			`Fastest size took ${smallest.ms.toFixed(4)} ms, close to timer resolution. Use larger sizes for a reliable result.`,
		);
	}
	if (!gc) {
		warnings.push('Run node with --expose-gc for steadier timings.');
	}
	return { samples, warnings };
}
