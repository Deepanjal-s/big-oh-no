/**
 * A real bug, reduced: an AI coding agent pulled XML tool calls out of model
 * replies with a lazy, back-referencing regex. On a reply full of unclosed
 * tags (think "<br>" in generated HTML) every "<br>" rescans to the end of
 * the text looking for "</br>", so parsing is O(n²) and the UI freezes.
 * See https://github.com/Nano-Collective/nanocoder/issues/1940
 */

export interface Match {
	name: string;
	inner: string;
}

/** The original approach: correct, but quadratic on unclosed tags. */
export function findTagsRegex(text: string): Match[] {
	const re = /<(\w+)>(.*?)<\/\1>/gs;
	const out: Match[] = [];
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: classic exec loop
	while ((m = re.exec(text)) !== null) out.push({ name: m[1], inner: m[2] });
	return out;
}

/**
 * Same results in O(n log n): index every closing tag once, then for each
 * opening tag binary-search the first matching close after it. Opening tags
 * with no close after them are skipped instantly instead of rescanning.
 */
export function findTagsIndexed(text: string): Match[] {
	const closes = new Map<string, number[]>();
	for (const m of text.matchAll(/<\/(\w+)>/g)) {
		const list = closes.get(m[1]);
		if (list) list.push(m.index);
		else closes.set(m[1], [m.index]);
	}

	const out: Match[] = [];
	const open = /<(\w+)>/g;
	let m: RegExpExecArray | null;
	// biome-ignore lint/suspicious/noAssignInExpressions: classic exec loop
	while ((m = open.exec(text)) !== null) {
		const name = m[1];
		const start = m.index + m[0].length;
		const list = closes.get(name);
		if (!list) continue;
		// First close at or after `start`.
		let lo = 0;
		let hi = list.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (list[mid] < start) lo = mid + 1;
			else hi = mid;
		}
		if (lo === list.length) continue;
		const end = list[lo];
		out.push({ name, inner: text.slice(start, end) });
		// Resume after the whole match, exactly like the regex's lastIndex.
		open.lastIndex = end + name.length + 3;
	}
	return out;
}

/** The input from the bug report: n lines, each with an unclosed <br>. */
export const unclosedTags = (n: number) => `Here is the html:\n${'line<br>\n'.repeat(n)}`;
