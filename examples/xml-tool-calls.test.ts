import { describe, expect, it } from 'vitest';
import '../src/vitest.js'; // in your project: import 'big-oh-no/vitest'
import { findTagsIndexed, findTagsRegex, unclosedTags } from './xml-tool-calls.js';

describe('XML tool-call parsing (nanocoder#1940)', () => {
	it('the regex version is quadratic, and big-oh-no catches it', async () => {
		await expect(findTagsRegex).not.toHaveComplexity('O(n)', unclosedTags);
	});

	it('the indexed version scales linearly', async () => {
		await expect(findTagsIndexed).toHaveComplexity('O(n)', unclosedTags);
	});

	it('both versions return the same matches', () => {
		const samples = [
			'<read_file><path>a.ts</path></read_file>',
			'x<br>y<a>1</a><br><b>2</b>',
			'<a>outer<a>inner</a>tail</a>',
			'<t>\nmulti\nline\n</t> and <t>again</t>',
			unclosedTags(50),
			'<a><a><a>deep</a>',
		];
		for (const s of samples) expect(findTagsIndexed(s)).toEqual(findTagsRegex(s));
	});
});
