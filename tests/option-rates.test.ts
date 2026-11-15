import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate } from '../src/lib/calculation';
import { DEMO } from '../src/lib/demo';
import { getOptionRates, isMinimumBelowCurrent } from '../src/lib/option-rates';
import type { ProjectInput } from '../src/lib/types';

const demo = (): ProjectInput => structuredClone(DEMO);

test('demo option rates both protect $60/hour without adding private fields to public options', () => {
  const input = demo();
  const calculation = calculate(input);
  const before = structuredClone(calculation.options);
  assert.deepEqual(getOptionRates(input, calculation), [
    { id: 'add', rateCents: 6000, minimumProtected: true },
    { id: 'swap', rateCents: 6000, minimumProtected: true },
  ]);
  assert.equal(isMinimumBelowCurrent(input), false);
  assert.deepEqual(calculation.options, before);
});

test('a $45 floor yields a $45 add-on and $46.15 swap, not an original-rate promise', () => {
  const input = demo();
  input.minimumRateCents = 4500;
  const calculation = calculate(input);
  assert.deepEqual(calculation.removedIndices, [2]);
  assert.deepEqual(getOptionRates(input, calculation), [
    { id: 'add', rateCents: 4500, minimumProtected: true },
    { id: 'swap', rateCents: 4615.384615384615, minimumProtected: true },
  ]);
  assert.equal(isMinimumBelowCurrent(input), true);
});

test('a free addition can leave the resulting rate above the chosen floor', () => {
  const input = demo();
  input.priceCents = 110000;
  const calculation = calculate(input);
  const rates = getOptionRates(input, calculation);
  assert.equal(calculation.options[0].extraCents, 0);
  assert.equal(rates.length, 1);
  assert.ok(Math.abs(rates[0].rateCents - 6666.666666666667) < 1e-9);
  assert.equal(rates[0].minimumProtected, true);
});

test('new direct expenses are deducted and an unavailable swap has no rate', () => {
  const input = demo();
  input.request.costCents = 3000;
  const calculation = calculate(input);
  assert.equal(calculation.options[0].totalCents, 103000);
  assert.deepEqual(getOptionRates(input, calculation), [
    { id: 'add', rateCents: 6000, minimumProtected: true },
  ]);
});

test('swap rate excludes both time and direct expenses of the removed items', () => {
  const input = demo();
  input.items[1].costCents = 3000;
  input.items[2].costCents = 2000;
  const calculation = calculate(input);
  assert.equal(calculation.options[0].totalCents, 105000);
  assert.deepEqual(calculation.removedIndices, [1, 2]);
  assert.deepEqual(getOptionRates(input, calculation), [
    { id: 'add', rateCents: 6000, minimumProtected: true },
    { id: 'swap', rateCents: 6000, minimumProtected: true },
  ]);
});

test('rounded-up package price can put the actual rate slightly above the floor', () => {
  const input: ProjectInput = {
    priceCents: 0, minimumRateCents: 100,
    items: [{ name: 'Original', minutes: 60, costCents: 0, swappable: false }],
    request: { name: 'Extra', minutes: 1, costCents: 0 },
  };
  const calculation = calculate(input);
  assert.equal(calculation.options[0].totalCents, 102);
  const [rate] = getOptionRates(input, calculation);
  assert.ok(Math.abs(rate.rateCents - 100.32786885245902) < 1e-10);
  assert.equal(rate.minimumProtected, true);
});

test('duplicate names do not remove the wrong original item from the swap calculation', () => {
  const input = demo();
  input.minimumRateCents = 4500;
  input.items[0].name = 'Same name';
  input.items[1].name = 'Same name';
  input.items[2].name = 'Same name';
  input.request.name = 'Same name';
  assert.deepEqual(getOptionRates(input, calculate(input)), [
    { id: 'add', rateCents: 4500, minimumProtected: true },
    { id: 'swap', rateCents: 4615.384615384615, minimumProtected: true },
  ]);
});

test('floor comparisons use exact boundaries even when displayed rates round identically', () => {
  const input: ProjectInput = {
    priceCents: 600100, minimumRateCents: 6000,
    items: [{ name: 'Original', minutes: 6001, costCents: 0, swappable: false }],
    request: { name: 'Extra', minutes: 0, costCents: 0 },
  };
  assert.equal(isMinimumBelowCurrent(input), false);
  input.priceCents = 600101;
  assert.equal(isMinimumBelowCurrent(input), true);
  input.priceCents = 600099;
  assert.equal(isMinimumBelowCurrent(input), false);
  const calculation = calculate(input);
  assert.equal(getOptionRates(input, calculation)[0].minimumProtected, true);
  // Deliberately lower the offered price by one cent: a rounded badge must not imply protection.
  calculation.options[0].totalCents = 600099;
  const [rate] = getOptionRates(input, calculation);
  assert.equal(Math.round(rate.rateCents), 6000);
  assert.equal(rate.minimumProtected, false);
});

test('maximum supported aggregates retain exact comparisons and a finite display rate', () => {
  const input: ProjectInput = {
    priceCents: 1000000000, minimumRateCents: 100000000,
    items: Array.from({ length: 12 }, (_, i) => ({ name: `Item ${i}`, minutes: 1000000, costCents: 1000000000, swappable: false })),
    request: { name: 'Extra', minutes: 1000000, costCents: 1000000000 },
  };
  const calculation = calculate(input);
  assert.equal(calculation.options[0].totalCents, 21679666666667);
  const [rate] = getOptionRates(input, calculation);
  assert.ok(Number.isFinite(rate.rateCents));
  assert.ok(Math.abs(rate.rateCents - 100000000.00000153) < 1e-7);
  assert.equal(rate.minimumProtected, true);
  assert.equal(isMinimumBelowCurrent(input), false);
});

test('zero floor and initially negative margin still report actual protected resulting rates', () => {
  const input = demo();
  input.priceCents = 0;
  input.minimumRateCents = 0;
  assert.equal(isMinimumBelowCurrent(input), false);
  assert.deepEqual(getOptionRates(input, calculate(input)), [
    { id: 'add', rateCents: 0, minimumProtected: true },
  ]);
});
