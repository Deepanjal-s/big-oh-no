import { expect } from 'vitest';
import { type BigOhNoMatchers, matchers } from './matchers.js';

expect.extend(matchers);

declare module 'vitest' {
	// Type parameters must match Vitest's own declaration exactly.
	interface Matchers<R extends void | Promise<void> = void | Promise<void>, T = unknown>
		extends BigOhNoMatchers<void> {}
}

export { matchers };
