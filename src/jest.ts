import { type BigOhNoMatchers, matchers } from './matchers.js';

const jestExpect = (globalThis as { expect?: { extend?: (m: object) => void } }).expect;
if (!jestExpect?.extend) {
	throw new Error(
		'big-oh-no/jest: no global `expect` found. Import this file from a Jest setup file (setupFilesAfterEnv), or call expect.extend(matchers) yourself with `import { matchers } from "big-oh-no"`.',
	);
}
jestExpect.extend(matchers);

declare global {
	namespace jest {
		interface Matchers<R> extends BigOhNoMatchers<R> {}
	}
}

export { matchers };
