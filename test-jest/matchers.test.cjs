require('big-oh-no/jest');

const range = (n) => Array.from({ length: n }, (_, i) => i);
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const pairs = (xs) => { let c = 0; for (const a of xs) for (const b of xs) if (a === b) c++; return c; };

test('jest: linear passes', async () => {
  await expect(sum).toBeLinear(range);
});

test('jest: quadratic is caught', async () => {
  await expect(pairs).not.toHaveComplexity('O(n)', range);
});
