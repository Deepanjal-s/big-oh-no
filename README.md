# big-oh-no

**Catch O(n²) regressions in your tests.**

`big-oh-no` checks how a function's running time *grows* as its input grows, and fails the test when it grows faster than you allow. It works in Vitest, Jest and `node:test`.

```ts
import 'big-oh-no/vitest';

test('parser stays linear', async () => {
  await expect(parse).toHaveComplexity('O(n)', (n) => makeInput(n));
});
```

```
parse grows faster than O(n): it looks like O(n^2) (exponent 2.02, allowed ≤ 1.35).

         n       time   growth
     2,048   2.908 ms
     4,096    11.6 ms    ×3.99
     8,192    46.5 ms    ×4.01
    16,384   192.9 ms    ×4.15
    32,768   779.2 ms    ×4.04

For O(n), doubling n should multiply time by about ×2.0, not ×4.1.
```

## Why

Accidentally quadratic code is one of the most common performance bugs, and one of the easiest to miss. It's a `.includes()` inside a loop, a regex that rescans the rest of the string, or a spread inside `reduce`. It's fast on test data and freezes on real data.

The usual guard is a time limit:

```ts
expect(duration).toBeLessThan(300); // ms
```

That test is **flaky**. It passes on your laptop and fails on a slow CI machine, or the other way round. So people loosen the limit until it catches nothing.

`big-oh-no` asserts the **growth rate** instead. It runs your function at n, 2n, 4n, 8n and 16n, then fits the slope on a log-log scale. Linear code roughly doubles its time each step (slope ≈ 1) and quadratic code quadruples it (slope ≈ 2). A slow machine makes every step slower but leaves the ratios almost unchanged, so the same test gives the same answer everywhere.

Python ([bigO](https://pythonspeed.com/articles/big-o-tests)), Rust ([big-o-test](https://lib.rs/crates/big-o-test)), Ruby ([complexity_assert](https://github.com/philou/complexity-assert)) and Java ([big-o-test](https://github.com/MarkusSprunck/big-o-test)) already have this. JavaScript didn't.

## Real example

[nanocoder#1940](https://github.com/Nano-Collective/nanocoder/issues/1940): an AI coding agent parsed XML tool calls with `/<(\w+)>(.*?)<\/\1>/gs`. When a model reply contains many unclosed tags, such as `<br>` in generated HTML, every `<br>` rescans to the end of the text looking for `</br>`. On a 180 KB reply that took 1.6 s and froze the UI.

[`examples/xml-tool-calls.test.ts`](examples/xml-tool-calls.test.ts) reproduces it:

```ts
const unclosedTags = (n: number) => `Here is the html:\n${'line<br>\n'.repeat(n)}`;

it('the regex version is quadratic, and big-oh-no catches it', async () => {
  await expect(findTagsRegex).not.toHaveComplexity('O(n)', unclosedTags);
});

it('the indexed version scales linearly', async () => {
  await expect(findTagsIndexed).toHaveComplexity('O(n)', unclosedTags);
});
```

This works on any machine, with no millisecond numbers to tune.

## Install

```sh
npm i -D big-oh-no
```

Node 18 or later. No dependencies.

## Usage

### Vitest

```ts
import { expect, test } from 'vitest';
import 'big-oh-no/vitest';

test('dedupe is linear', async () => {
  await expect(dedupe).toBeLinear((n) => randomArray(n));
});
```

To load it everywhere, put `import 'big-oh-no/vitest'` in a [setup file](https://vitest.dev/config/#setupfiles).

The matcher types are tested with Vitest 5. On older Vitest versions the matchers work at runtime; if TypeScript complains about the type augmentation, enable `skipLibCheck`.

### Jest

```js
// jest.config.js
module.exports = { setupFilesAfterEnv: ['big-oh-no/jest'] };
```

```js
test('dedupe is linear', async () => {
  await expect(dedupe).toBeLinear((n) => randomArray(n));
});
```

### node:test, Mocha, or anything else

```ts
import { assertComplexity } from 'big-oh-no';

await assertComplexity(dedupe, (n) => randomArray(n), 'O(n)');
// throws ComplexityError with the table above if it's slower
```

### Just tell me what it is

```ts
import { estimateComplexity } from 'big-oh-no';

const r = await estimateComplexity(mysteryFn, (n) => randomArray(n));
console.log(r.bestFit, r.exponent); // 'O(n^2)' 2.01
```

## API

### Matchers

| Matcher | Passes when the function grows no faster than |
| --- | --- |
| `toHaveComplexity(expected, makeInput, options?)` | `expected`, e.g. `'O(n)'`, `'O(n log n)'`, `'O(n^2)'` |
| `toBeLinear(makeInput, options?)` | `O(n)` |
| `toBeConstant(makeInput, options?)` | `O(1)` |

All matchers are async, so always `await` them. `.not` works too.

The expected class is an **upper bound**: O(n) code passes `toHaveComplexity('O(n^2)')`.

`makeInput(n)` builds the input of size `n`. It runs outside the timed section, and every timed run gets a fresh input, so functions that mutate their input (like an in-place sort) are measured fairly.

Accepted names: `O(1)`, `O(log n)`, `O(n)`, `O(n log n)`, `O(n^2)` / `O(n²)`, `O(n^3)`, `O(2^n)`, plus `constant`, `linear`, `quadratic`, `cubic`.

### Functions

| Function | Returns |
| --- | --- |
| `assertComplexity(fn, makeInput, expected, options?)` | the report; throws `ComplexityError` on failure |
| `checkComplexity(fn, makeInput, expected, options?)` | the report with `pass: boolean`; never throws on a slow result |
| `estimateComplexity(fn, makeInput, options?)` | `{ bestFit, exponent, samples, fits, … }` |
| `analyze(samples)` | the same analysis for `{ n, ms }[]` you measured yourself |

### Options

| Option | Default | What it does |
| --- | --- | --- |
| `sizes` | auto | Exact sizes to measure, e.g. `[1e3, 2e3, 4e3, 8e3]`. Skips calibration. |
| `minTimeMs` | `2` | Calibration grows n until one call takes this long, so the timer's noise is negligible. |
| `steps` | `5` | Number of sizes after calibration. 5 steps at ×2 cover a 16× range. |
| `factor` | `2` | Multiplier between sizes. |
| `reps` | `5` | Timed runs per size; the fastest is kept. |
| `budgetMs` | `5000` | Soft cap on total time. Stops adding sizes once the next one would go over (always keeps at least 3). |
| `tolerance` | `0.35` | Slack on the exponent. O(n) fails above 1.35. |
| `retries` | `1` | Re-measure before failing, so one noisy run doesn't fail CI. |
| `maxN` | `1e7` | Upper limit for calibration. |
| `name` | `fn.name` | Name used in messages. |

## How it works

1. **Warm up** the JIT on a small input.
2. **Calibrate:** grow n until a single call takes about `minTimeMs`.
3. **Measure** `steps` sizes. Each next size is predicted from the growth so far, and measuring stops early before the budget would be blown.
4. **Interleave** the repetitions round-robin across sizes, so a burst of background load hits every size equally instead of skewing one. Keep the fastest run per size.
5. **Fit** a least-squares line to log(time) against log(n). The slope is the exponent. Also fit each class's curve (`a·g(n) + c`) to name the best match.
6. **Judge:** pass if `exponent ≤ expected + tolerance`. On failure, re-measure `retries` times before reporting.

Results are stored in a variable the JIT can't see through, so it can't optimise the work away.

## Accuracy and limits

- **Polynomial degree is reliable:** O(1), O(n), O(n²) and O(n³) are far apart. The test suite runs real timings and passes repeatedly, including with every CPU core busy with other work.
- **Log factors are not reliable:** over a 16× range, n vs n log n, or 1 vs log n, are within measurement noise. `bestFit` may report a neighbour, and an O(n log n) function will usually pass an `O(n)` check. Use this library to catch degree changes like n → n², which are the costly ones.
- **Make the input match the case you care about.** Complexity depends on the input. A sort is fast on sorted data, and a hash map is slow when every key collides. The generator is where you describe the worst case.
- **Hardware isn't perfectly O(n).** When data outgrows the CPU cache, such as a `Set` or `Map` with millions of entries, each operation gets slower, and the measured growth goes up. That is real behaviour, but if you want to test the algorithm, keep sizes moderate with `sizes`.
- **Very fast functions** (well under a microsecond even at large n) are hard to time. You'll get a warning; pass larger `sizes` or measure a batch of calls.
- Each assertion takes about 1–5 seconds. Keep these tests in their own file, and run test files serially (`fileParallelism: false` in Vitest) so they don't compete for CPU.
- Running Node with `--expose-gc` gives steadier numbers.

## Contributing

Issues and PRs are welcome. Ideas on the roadmap:

- [ ] Memory complexity (`toHaveSpaceComplexity`)
- [ ] CLI: `npx big-oh-no ./file.js#fn --input array`
- [ ] Ready-made input generators (random/sorted/reversed arrays, strings, nested objects)
- [ ] Browser support (`performance.now()` already works; needs a runner)
- [ ] Bun and Deno test-runner adapters

```sh
npm install
npm run build
npm test          # Vitest suite, includes real timing tests
npm run test:jest # Jest integration
```

## License

MIT © Deepanjal
