import assert from 'node:assert/strict';
import test from 'node:test';
import { asDraft, emptyDraft, parseSavedDraft, serializeDraft, DRAFT_KEY, HANDOFF_KEY } from '../src/lib/draft';
import { DEMO } from '../src/lib/demo';

const envelope = () => ({ version: 1, mode: 'project', savedAt: '2026-11-15T00:00:00.000Z', draft: emptyDraft() });

test('draft round trip retains incomplete, invalid and zero-valued text without coercion', () => {
  const draft = emptyDraft();
  draft.priceCents = '700.';
  draft.minimumRateCents = '-1';
  draft.items[0] = { name: '', minutes: 'not a time', costCents: '0.00', swappable: true };
  draft.request = { name: '  unfinished request  ', minutes: '', costCents: '1.234' };
  const restored = parseSavedDraft(serializeDraft(draft, 'project'));
  assert.deepEqual(restored?.draft, draft);
  assert.equal(restored?.version, 1);
  assert.equal(restored?.mode, 'project');
  assert.ok(Number.isFinite(Date.parse(restored!.savedAt)));
  assert.notEqual(DRAFT_KEY, HANDOFF_KEY);
});

test('saved draft parses from a bounded strict schema and rejects corrupted or incompatible data', () => {
  for (const raw of [null, '', '{', 'null', '[]', JSON.stringify({ ...envelope(), version: 2 }),
    JSON.stringify({ ...envelope(), mode: 'unknown' }), JSON.stringify({ ...envelope(), savedAt: 'invalid' }),
    JSON.stringify({ ...envelope(), savedAt: '2026-02-30T00:00:00.000Z' }),
    JSON.stringify({ ...envelope(), savedAt: '2026' }), JSON.stringify({ ...envelope(), extra: true })]) {
    assert.equal(parseSavedDraft(raw), null);
  }
  const value = envelope();
  for (const draft of [null, [], { ...value.draft, items: [] }, { ...value.draft, items: Array(13).fill(value.draft.items[0]) },
    { ...value.draft, priceCents: 700 }, { ...value.draft, request: { ...value.draft.request, swappable: true } },
    { ...value.draft, items: [{ ...value.draft.items[0], swappable: 'true' }] }]) {
    assert.equal(parseSavedDraft(JSON.stringify({ ...value, draft })), null);
  }
});

test('local storage cannot inject capability links, confirmation state, or prototype properties', () => {
  for (const extra of [{ ownerPath: '/status/?token=secret' }, { clientPath: '/offer/?token=secret' }, { confirmation: { optionId: 'add' } }]) {
    assert.equal(parseSavedDraft(JSON.stringify({ ...envelope(), ...extra })), null);
    assert.equal(parseSavedDraft(JSON.stringify({ ...envelope(), draft: { ...emptyDraft(), ...extra } })), null);
  }
  const raw = JSON.stringify(envelope()).replace('"priceCents":""', '"__proto__":{"polluted":true},"priceCents":""');
  assert.equal(parseSavedDraft(raw), null);
  assert.equal(Object.hasOwn(Object.prototype, 'polluted'), false);
});

test('serialization allowlists draft inputs and does not retain accidental proposal metadata', () => {
  const draft = { ...emptyDraft(), ownerPath: '/status/?token=secret', confirmation: { optionId: 'swap' },
    items: [{ ...emptyDraft().items[0], clientPath: '/offer/?token=secret' }] };
  const raw = serializeDraft(draft, 'project');
  for (const forbidden of ['secret', 'ownerPath', 'clientPath', 'confirmation']) assert.ok(!raw.includes(forbidden));
  assert.deepEqual(parseSavedDraft(raw)?.draft, emptyDraft());
});

test('oversized text and payloads are rejected without truncating the draft', () => {
  const draft = emptyDraft();
  draft.priceCents = '1'.repeat(201);
  assert.throws(() => serializeDraft(draft, 'project'), /too large|unsupported/);
  draft.priceCents = '';
  draft.request.name = 'a'.repeat(1001);
  assert.throws(() => serializeDraft(draft, 'project'), /too large|unsupported/);
  assert.equal(parseSavedDraft(' '.repeat(65537)), null);
  const large = envelope();
  large.draft.items = Array.from({ length: 12 }, () => ({ name: '\u0000'.repeat(1000), minutes: '', costCents: '', swappable: false }));
  assert.equal(parseSavedDraft(JSON.stringify(large)), null, 'JSON escaping cannot bypass the byte limit');
});

test('new proposal draft copies exact cents and remains independent of the source snapshot', () => {
  const input = structuredClone(DEMO);
  input.priceCents = 70001;
  input.minimumRateCents = 6005;
  input.items[0].costCents = 1;
  input.request.costCents = 1_000_000_000;
  const draft = asDraft(input);
  assert.equal(draft.priceCents, '700.01');
  assert.equal(draft.minimumRateCents, '60.05');
  assert.equal(draft.items[0].costCents, '0.01');
  assert.equal(draft.request.costCents, '10000000');
  assert.equal(draft.items[0].minutes, '300');
  draft.items[0].name = 'Edited independently';
  draft.request.minutes = '1';
  assert.equal(input.items[0].name, 'Core event materials');
  assert.equal(input.request.minutes, 300);
  const serialized = serializeDraft(draft, 'project');
  draft.request.name = 'Another change';
  assert.equal(parseSavedDraft(serialized)?.draft.request.name, 'Short promo video');
  assert.throws(() => asDraft({ ...input, priceCents: 1.5 }), /integer cents/);
});
