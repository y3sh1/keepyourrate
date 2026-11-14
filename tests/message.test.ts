import assert from 'node:assert/strict';
import test from 'node:test';
import { buildClientMessage, formatMoney } from '../src/lib/message';
import type { PublicProposal } from '../src/lib/types';

const url = 'https://example.test/offer?token=public-access';
const snapshot = (): PublicProposal => ({ createdAt: '2026-11-15T00:00:00.000Z', originalPriceCents: 70000, confirmation: null, options: [
  { id: 'add', title: 'Add to package', totalCents: 100000, extraCents: 30000, unchanged: ['Core event materials', 'Extra social media formats', 'Print-ready version'], added: ['Short promo video'], removed: [] },
  { id: 'swap', title: 'Swap within budget', totalCents: 70000, extraCents: 0, unchanged: ['Core event materials'], added: ['Short promo video'], removed: ['Extra social media formats', 'Print-ready version'] },
] });

test('two-option published message states prices and concrete scope without private information', () => {
  const text = buildClientMessage(snapshot(), url);
  assert.match(text, /two options/);
  assert.match(text, /Add to package: \$1,000 total \(\$300 extra\)/);
  assert.match(text, /Swap within budget: \$700 total \(no extra charge\)/);
  assert.match(text, /Removed: Extra social media formats; Print-ready version\./);
  assert.match(text, /Added: Short promo video\./);
  assert.ok(text.endsWith(url));
  for (const privateTerm of ['hour', 'minutes', 'costCents', 'minimumRate', 'budgetGap', 'ownerPath', '/status', 'revenue', 'paid']) assert.ok(!text.includes(privateTerm), privateTerm);
});

test('only paid addition available: no swap and no extra alternative', () => {
  const proposal = snapshot(); proposal.options = [proposal.options[0]];
  const text = buildClientMessage(proposal, url);
  assert.match(text, /an updated option/);
  assert.match(text, /\$1,000 total \(\$300 extra\)/);
  assert.doesNotMatch(text, /Swap|Choose|two options|Removed:/);
  assert.match(text, /Review and confirm the updated scope/);
});

test('only free addition: one option with no extra charge and original total', () => {
  const proposal = snapshot(); proposal.options = [{ ...proposal.options[0], totalCents: 70000, extraCents: 0 }];
  const text = buildClientMessage(proposal, url);
  assert.match(text, /Add to package: \$700 total \(no extra charge\)/);
  assert.doesNotMatch(text, /Swap|two options|\$300|Removed:/);
});

test('confirmed proposal describes saved choice only and never offers a second choice', () => {
  const proposal = snapshot(); proposal.confirmation = { optionId: 'swap', confirmedAt: '2026-11-15T00:02:00.000Z' };
  const text = buildClientMessage(proposal, url);
  assert.match(text, /Thanks for confirming/);
  assert.match(text, /Here is what we agreed/);
  assert.match(text, /Swap within budget: \$700/);
  assert.match(text, /View the agreed scope/);
  assert.doesNotMatch(text, /Add to package|\$1,000|\$300|Choose|Review and confirm|two options/);
});

test('money formatting preserves cents and separators', () => {
  assert.equal(formatMoney(100000), '$1,000');
  assert.equal(formatMoney(100001), '$1,000.01');
  assert.equal(formatMoney(1), '$0.01');
  assert.equal(formatMoney(0), '$0');
});
