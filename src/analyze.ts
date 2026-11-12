/**
 * Pure analysis of (n, time) samples. No timing happens here, so everything
 * in this file is deterministic and unit-testable with synthetic data.
 */

export type Complexity =
	| 'O(1)'
	| 'O(log n)'
	| 'O(n)'
	| 'O(n log n)'
	| 'O(n^2)'
	| 'O(n^3)'
	| 'O(2^n)';

/** Every name we accept from users, mapped to the canonical class. */
const ALIASES: Record<string, Complexity> = {
	'o(1)': 'O(1)',
	constant: 'O(1)',
	'o(log n)': 'O(log n)',
	'o(logn)': 'O(log n)',
	logarithmic: 'O(log n)',
	'o(n)': 'O(n)',
	linear: 'O(n)',
	'o(n log n)': 'O(n log n)',
	'o(nlogn)': 'O(n log n)',
	linearithmic: 'O(n log n)',
	'o(n^2)': 'O(n^2)',
	'o(n²)': 'O(n^2)',
	'o(n2)': 'O(n^2)',
	quadratic: 'O(n^2)',
	'o(n^3)': 'O(n^3)',
	'o(n³)': 'O(n^3)',
	'o(n3)': 'O(n^3)',
	cubic: 'O(n^3)',
	'o(2^n)': 'O(2^n)',
	exponential: 'O(2^n)',
};

export function normalizeComplexity(input: string): Complexity {
	const key = input.trim().toLowerCase().replace(/\s+/g, ' ');
	const found = ALIASES[key] ?? ALIASES[key.replace(/ /g, '')];
	if (!found) {
		throw new TypeError(
			`big-oh-no: unknown complexity "${input}". Use one of: ${COMPLEXITIES.join(', ')}`,
		);
	}
	return found;
}

export const COMPLEXITIES: readonly Complexity[] = [
	'O(1)',
	'O(log n)',
	'O(n)',
	'O(n log n)',
	'O(n^2)',
	'O(n^3)',
	'O(2^n)',
];

/** Growth curves used for best-fit classification. */
const MODELS: Record<Complexity, (n: number) => number> = {
	'O(1)': () => 1,
	'O(log n)': (n) => Math.log2(Math.max(n, 2)),
	'O(n)': (n) => n,
	'O(n log n)': (n) => n * Math.log2(Math.max(n, 2)),
	'O(n^2)': (n) => n * n,
	'O(n^3)': (n) => n * n * n,
	'O(2^n)': (n) => 2 ** n,
};

/**
 * The log-log slope each class produces in practice. The slope of n·log n
 * over a typical measured range is a little above 1; log n is close to 0.
 */
export const EXPECTED_EXPONENT: Record<Complexity, number> = {
	'O(1)': 0,
	'O(log n)': 0.1,
	'O(n)': 1,
	'O(n log n)': 1.15,
	'O(n^2)': 2,
	'O(n^3)': 3,
	'O(2^n)': Number.POSITIVE_INFINITY,
};

export interface Sample {
	/** Input size. */
	n: number;
	/** Time in milliseconds (the minimum or median of the repetitions). */
	ms: number;
}

export interface ModelFit {
	complexity: Complexity;
	/** Root-mean-square relative error of the fit. Lower is better. */
	error: number;
}

export interface Analysis {
	samples: Sample[];
	/** Least-squares slope of log(time) against log(n): ~0 constant, ~1 linear, ~2 quadratic. */
	exponent: number;
	/** How well a straight line fits on the log-log plot (0..1). */
	r2: number;
	/** Time ratio between each pair of consecutive sizes. */
	stepRatios: number[];
	/** The class whose curve fits the data best. */
	bestFit: Complexity;
	fits: ModelFit[];
}

/** Ordinary least squares of y on x. */
function linearRegression(xs: number[], ys: number[]) {
	const n = xs.length;
	const mx = xs.reduce((a, b) => a + b, 0) / n;
	const my = ys.reduce((a, b) => a + b, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		const dx = xs[i] - mx;
		const dy = ys[i] - my;
		sxy += dx * dy;
		sxx += dx * dx;
		syy += dy * dy;
	}
	const slope = sxx === 0 ? 0 : sxy / sxx;
	const r2 = sxx === 0 || syy === 0 ? 1 : (sxy * sxy) / (sxx * syy);
	return { slope, r2 };
}

/**
 * Fit time ≈ a·g(n) + c (a, c ≥ 0) minimising relative error, so small and
 * large sizes count equally. Returns the RMS relative error.
 */
function fitModel(samples: Sample[], g: (n: number) => number): number {
	const gs = samples.map((s) => g(s.n));
	if (gs.some((v) => !Number.isFinite(v))) return Number.POSITIVE_INFINITY;
	const ts = samples.map((s) => s.ms);

	// Weighted least squares with weights 1/t² (relative error).
	let sgg = 0;
	let sg = 0;
	let s1 = 0;
	let sgt = 0;
	let st = 0;
	for (let i = 0; i < ts.length; i++) {
		const w = 1 / (ts[i] * ts[i]);
		sgg += w * gs[i] * gs[i];
		sg += w * gs[i];
		s1 += w;
		sgt += w * gs[i] * ts[i];
		st += w * ts[i];
	}
	const det = sgg * s1 - sg * sg;
	let a = det === 0 ? 0 : (sgt * s1 - sg * st) / det;
	let c = det === 0 ? st / s1 : (sgg * st - sg * sgt) / det;

	// Keep the curve physical: no negative growth, no negative overhead.
	if (a < 0) {
		a = 0;
		c = st / s1;
	} else if (c < 0) {
		c = 0;
		a = sgg === 0 ? 0 : sgt / sgg;
	}

	let sum = 0;
	for (let i = 0; i < ts.length; i++) {
		const rel = (a * gs[i] + c - ts[i]) / ts[i];
		sum += rel * rel;
	}
	return Math.sqrt(sum / ts.length);
}

export function analyze(input: readonly Sample[]): Analysis {
	const samples = [...input]
		.filter((s) => s.n > 0 && s.ms > 0 && Number.isFinite(s.ms))
		.sort((a, b) => a.n - b.n);
	if (samples.length < 3) {
		throw new RangeError('big-oh-no: need at least 3 samples with positive n and time');
	}

	const { slope, r2 } = linearRegression(
		samples.map((s) => Math.log(s.n)),
		samples.map((s) => Math.log(s.ms)),
	);

	const stepRatios = samples.slice(1).map((s, i) => s.ms / samples[i].ms);

	const fits = COMPLEXITIES.map((complexity) => ({
		complexity,
		error: fitModel(samples, MODELS[complexity]),
	})).sort((a, b) => a.error - b.error);

	return {
		samples,
		exponent: slope,
		r2,
		stepRatios,
		bestFit: closestByExponent(slope, fits),
		fits,
	};
}

/**
 * Pick the class to report. Curve fitting alone can't separate n from n·log n
 * on noisy data, so among the fits that are nearly as good as the best one
 * we prefer the class whose typical exponent is closest to the measured slope.
 */
function closestByExponent(exponent: number, fits: ModelFit[]): Complexity {
	const best = fits[0].error;
	const contenders = fits.filter((f) => f.error <= best * 1.5 + 0.02);
	let pick = contenders[0].complexity;
	let dist = Number.POSITIVE_INFINITY;
	for (const f of contenders) {
		const e = EXPECTED_EXPONENT[f.complexity];
		const d = Number.isFinite(e) ? Math.abs(e - exponent) : 10;
		if (d < dist) {
			dist = d;
			pick = f.complexity;
		}
	}
	return pick;
}

export interface Verdict {
	pass: boolean;
	expected: Complexity;
	/** Largest exponent that still counts as passing. */
	maxExponent: number;
	analysis: Analysis;
}

/**
 * Upper-bound check: passes when the code grows no faster than `expected`.
 * Faster-than-expected (e.g. O(1) when O(n) was allowed) is a pass.
 */
export function judge(analysis: Analysis, expected: Complexity, tolerance = 0.35): Verdict {
	const maxExponent = EXPECTED_EXPONENT[expected] + tolerance;
	return {
		pass: analysis.exponent <= maxExponent,
		expected,
		maxExponent,
		analysis,
	};
}
