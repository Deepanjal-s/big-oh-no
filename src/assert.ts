import {
	type Analysis,
	type Complexity,
	EXPECTED_EXPONENT,
	analyze,
	judge,
	normalizeComplexity,
	type Verdict,
} from './analyze.js';
import { type Fn, type MakeInput, type MeasureOptions, measure } from './measure.js';

export interface ComplexityOptions extends MeasureOptions {
	/**
	 * Slack added to the expected exponent before failing. Default 0.35:
	 * O(n) fails above an exponent of 1.35, O(n^2) above 2.35.
	 */
	tolerance?: number;
	/**
	 * Re-measure this many times before reporting a failure, so one noisy
	 * run (a GC pause, a busy CI box) doesn't fail the build. Default 1.
	 */
	retries?: number;
	/** Name shown in messages. Defaults to the function's name. */
	name?: string;
}

export interface ComplexityReport extends Verdict {
	name: string;
	warnings: string[];
	attempts: number;
}

/** Measure `fn` and judge it against `expected`, without throwing. */
export async function checkComplexity<I>(
	fn: Fn<I>,
	makeInput: MakeInput<I>,
	expected: Complexity | string,
	options: ComplexityOptions = {},
): Promise<ComplexityReport> {
	if (typeof fn !== 'function') throw new TypeError('big-oh-no: expected a function to measure');
	if (typeof makeInput !== 'function') {
		throw new TypeError('big-oh-no: pass an input generator, e.g. (n) => makeArray(n)');
	}
	const target = normalizeComplexity(expected);
	const retries = options.retries ?? 1;
	let report: ComplexityReport | undefined;
	for (let attempt = 1; attempt <= retries + 1; attempt++) {
		const { samples, warnings } = await measure(fn, makeInput, options);
		const verdict = judge(analyze(samples), target, options.tolerance);
		report = { ...verdict, name: options.name || fn.name || 'function', warnings, attempts: attempt };
		if (report.pass) break;
	}
	return report as ComplexityReport;
}

export class ComplexityError extends Error {
	readonly report: ComplexityReport;
	constructor(report: ComplexityReport) {
		super(formatFailure(report));
		this.name = 'ComplexityError';
		this.report = report;
	}
}

/** Measure `fn` and throw a ComplexityError if it grows faster than `expected`. */
export async function assertComplexity<I>(
	fn: Fn<I>,
	makeInput: MakeInput<I>,
	expected: Complexity | string,
	options: ComplexityOptions = {},
): Promise<ComplexityReport> {
	const report = await checkComplexity(fn, makeInput, expected, options);
	if (!report.pass) throw new ComplexityError(report);
	return report;
}

/** Measure `fn` and report the class it appears to be. */
export async function estimateComplexity<I>(
	fn: Fn<I>,
	makeInput: MakeInput<I>,
	options: MeasureOptions = {},
): Promise<Analysis & { warnings: string[] }> {
	const { samples, warnings } = await measure(fn, makeInput, options);
	return { ...analyze(samples), warnings };
}

function fmtMs(ms: number): string {
	if (ms >= 1000) return `${(ms / 1000).toFixed(2)} s`;
	if (ms >= 10) return `${ms.toFixed(1)} ms`;
	return `${ms.toFixed(3)} ms`;
}

/** A small table of sizes, times and growth per step. */
export function formatTable(analysis: Analysis): string {
	const rows = analysis.samples.map((s, i) => [
		s.n.toLocaleString('en-US'),
		fmtMs(s.ms),
		i === 0 ? '' : `×${analysis.stepRatios[i - 1].toFixed(2)}`,
	]);
	const head = ['n', 'time', 'growth'];
	const widths = head.map((h, c) => Math.max(h.length, ...rows.map((r) => r[c].length)));
	const line = (cells: string[]) => cells.map((cell, c) => cell.padStart(widths[c])).join('   ');
	return [line(head), ...rows.map(line)].map((l) => `    ${l}`).join('\n');
}

export function formatFailure(report: ComplexityReport): string {
	const a = report.analysis;
	const lines = [
		`${report.name} grows faster than ${report.expected}: it looks like ${a.bestFit} (exponent ${a.exponent.toFixed(2)}, allowed ≤ ${report.maxExponent.toFixed(2)}).`,
		'',
		formatTable(a),
	];
	const e = EXPECTED_EXPONENT[report.expected];
	if (Number.isFinite(e)) {
		lines.push(
			'',
			`For ${report.expected}, doubling n should multiply time by about ×${(2 ** e).toFixed(1)}, not ×${(2 ** a.exponent).toFixed(1)}.`,
		);
	}
	if (report.attempts > 1) lines.push(`Failed on all ${report.attempts} attempts.`);
	for (const w of report.warnings) lines.push(`Note: ${w}`);
	return lines.join('\n');
}

export function formatPass(report: ComplexityReport): string {
	const a = report.analysis;
	return [
		`${report.name} grows no faster than ${report.expected}: it looks like ${a.bestFit} (exponent ${a.exponent.toFixed(2)}).`,
		'',
		formatTable(a),
	].join('\n');
}
