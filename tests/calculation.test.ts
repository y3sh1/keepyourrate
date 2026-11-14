import assert from 'node:assert/strict';
import test from 'node:test';
import { calculate } from '../src/lib/calculation';
import { DEMO } from '../src/lib/demo';
import { validateInput, InputValidationError, LIMITS } from '../src/lib/validation';
import type { ProjectInput, WorkItem } from '../src/lib/types';

const demo = (): ProjectInput => structuredClone(DEMO);
const item = (name: string, minutes: number, swappable = true, costCents = 0): WorkItem => ({ name, minutes, swappable, costCents });
const project = (items: WorkItem[], requestMinutes: number, priceCents: number, minimumRateCents = 6000): ProjectInput => ({
  priceCents, minimumRateCents, items, request: { name: 'New work', minutes: requestMinutes, costCents: 0 },
});

test('demo: exact $60 → $40, -33.3%, $1,000 total / $300 extra, two specific removals', () => {
  const result = calculate(demo());
  assert.equal(result.currentRateCents, 6000);
  assert.equal(result.freeRateCents, 4000);
  assert.equal(result.changePercent!.toFixed(1), '-33.3');
  assert.equal(result.options[0].totalCents, 100000);
  assert.equal(result.options[0].extraCents, 30000);
  assert.deepEqual(result.options[1], { id: 'swap', title: 'Swap within budget', totalCents: 70000, extraCents: 0, unchanged: ['Core event materials'], added: ['Short promo video'], removed: ['Extra social media formats', 'Print-ready version'] });
  assert.deepEqual(result.removedIndices, [1, 2]);
  assert.equal(result.budgetGapCents, null);
});

test('making either optional demo item mandatory removes swap and protects it', () => {
  for (const [index, gap] of [[1, 18000], [2, 12000]]) {
    const input = demo();
    input.items[index].swappable = false;
    const result = calculate(input);
    assert.equal(result.options.length, 1);
    assert.equal(result.options[0].totalCents, 100000);
    assert.equal(result.budgetGapCents, gap);
    assert.deepEqual(result.removedIndices, []);
  }
});

test('$30 new expenses: $1,030 full package / $330 extra versus $30 minimum-budget shortfall', () => {
  const input = demo();
  input.request.costCents = 3000;
  const result = calculate(input);
  assert.equal(result.options[0].totalCents, 103000);
  assert.equal(result.options[0].extraCents, 33000);
  assert.equal(result.options.length, 1);
  assert.equal(result.budgetGapCents, 3000);
  assert.equal(result.currentRateCents, 6000);
  assert.equal(result.freeRateCents, 3800);
});

test('editing time, original price, and original costs recalculates from data', () => {
  const longer = demo();
  longer.request.minutes = 360;
  assert.equal(calculate(longer).options[0].totalCents, 106000);
  assert.equal(calculate(longer).budgetGapCents, 6000);
  const price = demo();
  price.priceCents = 80000;
  const priced = calculate(price);
  assert.equal(priced.currentRateCents, 7000);
  assert.equal(priced.options[0].extraCents, 20000);
  assert.deepEqual(priced.removedIndices, [1, 2]);
  const expense = demo();
  expense.items[0].costCents = 12000;
  assert.equal(calculate(expense).options[0].totalCents, 102000);
  assert.equal(calculate(expense).budgetGapCents, 2000);
});

test('all original work plus new request fits: exactly one free addition', () => {
  const input = demo(); input.priceCents = 100000;
  const result = calculate(input);
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].totalCents, 100000);
  assert.equal(result.options[0].extraCents, 0);
  assert.deepEqual(result.options[0].removed, []);
  assert.deepEqual(result.options[0].added, ['Short promo video']);
  assert.equal(result.budgetGapCents, null);
});

test('minimum below original rate protects chosen minimum without claiming original rate', () => {
  const input = demo(); input.minimumRateCents = 4000;
  const result = calculate(input);
  assert.equal(result.currentRateCents, 6000);
  assert.equal(result.freeRateCents, 4000);
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].extraCents, 0);
  input.minimumRateCents = 5000;
  assert.equal(calculate(input).options[0].totalCents, 85000);
  assert.equal(calculate(input).options[0].extraCents, 15000);
});

test('swap priority 1: fewer removed items wins even when more minutes are removed', () => {
  const input = project([item('Required', 60, false), item('Large', 180), item('Small A', 60), item('Small B', 60)], 120, 36000);
  const result = calculate(input);
  assert.deepEqual(result.removedIndices, [1]);
  assert.deepEqual(result.options[1].unchanged, ['Required', 'Small A', 'Small B']);
  assert.deepEqual(result.options[1].added, ['New work']);
});

test('swap priority 2: among equal item counts remove fewer minutes', () => {
  const result = calculate(project([item('Required', 60, false), item('Longer', 180), item('Shorter', 120)], 120, 36000));
  assert.deepEqual(result.removedIndices, [2]);
});

test('swap priority 3: equal count/time uses lexicographic original index lists', () => {
  const input = project([item('Required', 60, false), item('First', 60), item('Second', 60), item('Third', 60), item('Fourth', 60)], 120, 30000);
  for (let repeat = 0; repeat < 5; repeat++) assert.deepEqual(calculate(input).removedIndices, [1, 2]);
});

test('lexicographic ordering uses numerical indices, including index 10', () => {
  const items = Array.from({ length: 12 }, (_, index) => item(`Item ${index}`, 60, index === 2 || index === 10));
  const result = calculate(project(items, 60, 72000));
  assert.deepEqual(result.removedIndices, [2]);
});

test('lexicographically earlier pair wins even when its bitmask is enumerated later', () => {
  const input = project([item('Required', 60, false), item('First', 60), item('Second', 120), item('Third', 180), item('Fourth', 240)], 300, 66000);
  // [2, 3] and [1, 4] each remove two items and 300 minutes.
  // [2, 3] is encountered first in numeric bitmask enumeration.
  assert.deepEqual(calculate(input).removedIndices, [1, 4]);
});

test('ceil price to cent; exact below-boundary comparison must not round into a valid free option', () => {
  const input = project([item('One minute', 1, false)], 1, 3333, 100000);
  const result = calculate(input);
  assert.equal(result.options[0].totalCents, 3334);
  assert.equal(result.options[0].extraCents, 1);
  assert.equal(result.options.length, 1);
  assert.equal(result.budgetGapCents, 1);
  input.priceCents = 3334;
  assert.equal(calculate(input).options[0].extraCents, 0);
  assert.equal(calculate(input).budgetGapCents, null);
});

test('exact integer minimum-rate boundary accepts equality, rejects one cent below', () => {
  const input = project([item('Original', 60, false)], 60, 12000);
  assert.equal(calculate(input).options[0].extraCents, 0);
  input.priceCents = 11999;
  assert.equal(calculate(input).options[0].extraCents, 1);
  assert.equal(calculate(input).budgetGapCents, 1);
});

test('zero and negative original rates omit percentage; nonnegative required price still covers expenses', () => {
  const input = project([item('Original', 60, false, 10000)], 60, 10000);
  assert.equal(calculate(input).currentRateCents, 0);
  assert.equal(calculate(input).changePercent, null);
  input.priceCents = 5000;
  assert.equal(calculate(input).currentRateCents, -5000);
  assert.equal(calculate(input).changePercent, null);
  assert.equal(calculate(input).options[0].totalCents, 22000);
});

test('zero rate still covers direct expenses and never discounts the original price', () => {
  const input = project([item('Original', 60, false, 8000)], 0, 10000, 0);
  input.request.costCents = 3000;
  assert.equal(calculate(input).options[0].totalCents, 11000);
  assert.equal(calculate(input).budgetGapCents, 1000);
  input.priceCents = 12000;
  assert.equal(calculate(input).options[0].totalCents, 12000);
  assert.equal(calculate(input).options[0].extraCents, 0);
});

test('zero-minute new request is retained and zero-time final swaps are excluded', () => {
  const input = project([item('Only work', 60, true, 5000)], 0, 1000);
  input.request.costCents = 100;
  const result = calculate(input);
  assert.equal(result.options.length, 1);
  assert.equal(result.options[0].totalCents, 11100);
  assert.equal(result.budgetGapCents, 10100);
  assert.deepEqual(result.options[0].added, ['New work']);
});

test('upper supported limits remain safe through exact intermediate products', () => {
  const input = project(Array.from({ length: 12 }, (_, index) => item(`Item ${index}`, LIMITS.minutes, false, LIMITS.moneyCents)), LIMITS.minutes, LIMITS.moneyCents, LIMITS.rateCents);
  input.request.costCents = LIMITS.moneyCents;
  const result = calculate(input);
  assert.equal(result.options[0].totalCents, 21679666666667);
  assert.equal(result.options[0].extraCents, 21678666666667);
  assert.equal(Number.isSafeInteger(result.options[0].totalCents), true);
});

test('snapshots do not mutate source inputs and calculated options contain no private fields', () => {
  const input = demo(); const before = structuredClone(input);
  const result = calculate(input);
  assert.deepEqual(input, before);
  input.items[0].name = 'Changed later';
  assert.equal(result.options[0].unchanged[0], 'Core event materials');
  assert.deepEqual(Object.keys(result.options[0]).sort(), ['added', 'extraCents', 'id', 'removed', 'title', 'totalCents', 'unchanged']);
});

test('validation rejects nonfinite, negative, fractional, coercible, oversized and missing fields', () => {
  for (const value of [NaN, Infinity, -Infinity, -1, 0.5, '70000', null, undefined, 1_000_000_001]) {
    assert.ok(validateInput({ ...demo(), priceCents: value }).errors.priceCents, String(value));
  }
  assert.ok(validateInput({ ...demo(), minimumRateCents: 100_000_001 }).errors.minimumRateCents);
  for (const value of [-1, 0.1, Infinity, 1_000_001]) {
    const input = demo(); input.request.minutes = value;
    assert.ok(validateInput(input).errors['request.minutes']);
  }
  const input = demo(); input.items[0].costCents = -1;
  assert.ok(validateInput(input).errors['items.0.costCents']);
  input.items[0].name = '   ';
  assert.ok(validateInput(input).errors['items.0.name']);
  input.request.name = 'x'.repeat(161);
  assert.ok(validateInput(input).errors['request.name']);
  assert.throws(() => calculate(input), InputValidationError);
});

test('validation requires original time > 0, 1–12 original items and boolean swap markers', () => {
  assert.ok(validateInput(project([item('Zero', 0)], 60, 10000)).errors.items);
  assert.ok(validateInput(project([], 60, 10000)).errors.items);
  assert.ok(validateInput(project(Array.from({ length: 13 }, () => item('Item', 60)), 60, 10000)).errors.items);
  assert.ok(validateInput({ ...demo(), items: [{ ...demo().items[0], swappable: 'yes' }] }).errors['items.0.swappable']);
});

test('validation rejects supplied prices/options and arbitrary object properties instead of silently stripping', () => {
  assert.ok(validateInput({ ...demo(), totalCents: 1 }).errors._form);
  assert.ok(validateInput({ ...demo(), options: [] }).errors._form);
  assert.ok(validateInput({ ...demo(), request: { ...demo().request, confirmed: true } }).errors.request);
  assert.ok(validateInput({ ...demo(), items: [{ ...demo().items[0], totalCents: 1 }] }).errors['items.0']);
  assert.ok(validateInput(null).errors._form);
  assert.ok(validateInput([]).errors._form);
});

test('validation returns a distinct snapshot and rejects message control-character injection', () => {
  const input = demo();
  const validated = validateInput(input);
  assert.deepEqual(validated.errors, {});
  input.items[0].minutes = 1;
  assert.equal(validated.input!.items[0].minutes, 300);
  input.request.name = 'Request\nPrivate information';
  assert.ok(validateInput(input).errors['request.name']);
});
