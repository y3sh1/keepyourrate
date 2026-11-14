import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProjectInput, PublicProposal, Published, PrivateProposal } from '../src/lib/types';

const base = (process.env.BASE_URL ?? 'http://localhost:8787').replace(/\/$/, '');
// Deliberately independent, fixed expectations: never calculate expected prices with production logic.
const demo: ProjectInput = {
  priceCents: 70000, minimumRateCents: 6000,
  items: [
    { name: 'Core event materials', minutes: 300, costCents: 10000, swappable: false },
    { name: 'Extra social media formats', minutes: 180, costCents: 0, swappable: true },
    { name: 'Print-ready version', minutes: 120, costCents: 0, swappable: true },
  ],
  request: { name: 'Short promo video', minutes: 300, costCents: 0 },
};
const clone = (): ProjectInput => structuredClone(demo);
const token = (link: string): string => new URL(link, base).searchParams.get('token')!;

async function api<T = Record<string, unknown>>(route: string, body?: unknown) {
  const response = await fetch(`${base}${route}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: 'error',
  });
  const text = await response.text();
  let data: T;
  try { data = JSON.parse(text) as T; }
  catch { throw new Error(`Expected JSON at ${route.replace(/[A-Za-z0-9_-]{30,}/g, '[token]')}; HTTP ${response.status}`); }
  return { response, data, text };
}
async function publish(input: ProjectInput = clone()): Promise<Published> {
  const result = await api<Published>('/api/proposals', input);
  assert.equal(result.response.status, 201, 'publication succeeds against persistent server storage');
  assert.ok(result.data.clientPath.startsWith('/offer/'));
  assert.ok(result.data.ownerPath.startsWith('/status/'));
  const client = token(result.data.clientPath), owner = token(result.data.ownerPath);
  assert.ok(client.length >= 32 && owner.length >= 32, 'tokens contain sufficient random material');
  assert.notEqual(client, owner, 'capabilities are independent');
  publicOnly(result.data.proposal);
  return result.data;
}
function keys(value: object, expected: string[]): void {
  assert.deepEqual(Object.keys(value).sort(), expected.sort());
}
function publicOnly(value: PublicProposal): void {
  keys(value, ['createdAt', 'originalPriceCents', 'options', 'confirmation']);
  assert.ok(Number.isFinite(Date.parse(value.createdAt)));
  assert.ok(Number.isSafeInteger(value.originalPriceCents));
  assert.ok(value.options.length >= 1 && value.options.length <= 2);
  for (const option of value.options) {
    keys(option, ['id', 'title', 'totalCents', 'extraCents', 'unchanged', 'added', 'removed']);
    for (const group of [option.unchanged, option.added, option.removed]) {
      assert.ok(Array.isArray(group));
      assert.ok(group.every(item => typeof item === 'string'));
    }
  }
  if (value.confirmation) {
    keys(value.confirmation, ['optionId', 'confirmedAt']);
    assert.ok(Number.isFinite(Date.parse(value.confirmation.confirmedAt)));
  }
}
function rejection(status: number): void {
  assert.ok(status === 400 || status === 422, `expected validation rejection, received ${status}`);
}

test('publish → anonymous client → confirm → owner reload; public data allowlist', async () => {
  const published = await publish();
  const clientToken = token(published.clientPath), ownerToken = token(published.ownerPath);
  const initial = await api<PublicProposal>(`/api/client/${clientToken}`);
  assert.equal(initial.response.status, 200);
  publicOnly(initial.data);
  assert.equal(initial.data.confirmation, null);
  assert.deepEqual(initial.data.options.map(x => [x.id, x.totalCents, x.extraCents]), [
    ['add', 100000, 30000], ['swap', 70000, 0],
  ]);
  assert.deepEqual(initial.data.options[1].unchanged, ['Core event materials']);
  assert.deepEqual(initial.data.options[1].added, ['Short promo video']);
  assert.deepEqual(initial.data.options[1].removed, ['Extra social media formats', 'Print-ready version']);
  assert.match(initial.response.headers.get('cache-control') ?? '', /no-store/i);
  assert.ok(!initial.text.includes(ownerToken), 'owner capability never reaches client API');
  const page = await fetch(new URL(published.clientPath, base));
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.ok(!html.includes(ownerToken), 'HTML does not contain owner capability');
  assert.ok(!html.includes('minimumRateCents'), 'HTML does not contain private input data');
  const accepted = await api<PublicProposal>(`/api/client/${clientToken}/confirm`, { optionId: 'swap' });
  assert.equal(accepted.response.status, 200);
  publicOnly(accepted.data);
  assert.equal(accepted.data.confirmation?.optionId, 'swap');
  const owner = await api<PrivateProposal>(`/api/owner/${ownerToken}`);
  assert.equal(owner.response.status, 200);
  assert.deepEqual(owner.data.proposal.confirmation, accepted.data.confirmation);
  assert.deepEqual(owner.data.input, demo);
  assert.equal(owner.data.calculation.currentRateCents, 6000);
  assert.equal(owner.data.calculation.freeRateCents, 4000);
  const repeated = await api<PublicProposal>(`/api/client/${clientToken}/confirm`, { optionId: 'swap' });
  assert.equal(repeated.response.status, 200);
  assert.deepEqual(repeated.data, accepted.data, 'same choice is idempotent, including timestamp');
  const changed = await api<{ error: string; proposal: PublicProposal }>(`/api/client/${clientToken}/confirm`, { optionId: 'add' });
  assert.equal(changed.response.status, 409);
  publicOnly(changed.data.proposal);
  assert.deepEqual(changed.data.proposal.confirmation, accepted.data.confirmation);
  const reloaded = await api<PublicProposal>(`/api/client/${clientToken}`);
  assert.deepEqual(reloaded.data.confirmation, accepted.data.confirmation);
});

test('capabilities are not interchangeable; invalid links return no private data', async () => {
  const published = await publish();
  for (const route of [
    `/api/owner/${token(published.clientPath)}`,
    `/api/client/${token(published.ownerPath)}`,
    '/api/client/invalid', '/api/owner/invalid',
    `/api/client/${'x'.repeat(43)}`, `/api/owner/${'x'.repeat(43)}`,
  ]) {
    const result = await api(route);
    assert.equal(result.response.status, 404);
    for (const forbidden of ['costCents', 'minimumRateCents', 'minutes', 'calculation', token(published.ownerPath)]) {
      assert.ok(!result.text.includes(forbidden), `invalid-link response omits ${forbidden.length > 30 ? '[token]' : forbidden}`);
    }
  }
});

test('server rejects tampered totals, invalid input, and nonexistent choice', async () => {
  const tampered = await api('/api/proposals', { ...clone(), options: [{ id: 'add', totalCents: 1 }] });
  rejection(tampered.response.status);
  const cases: unknown[] = [
    { ...clone(), priceCents: -1 }, { ...clone(), priceCents: 1.5 },
    { ...clone(), priceCents: null }, { ...clone(), priceCents: Number.MAX_SAFE_INTEGER },
    { ...clone(), minimumRateCents: -1 },
    { ...clone(), items: [] }, { ...clone(), items: Array.from({ length: 13 }, () => clone().items[0]) },
    { ...clone(), items: clone().items.map(x => ({ ...x, minutes: 0 })) },
    { ...clone(), request: { ...demo.request, name: '  ' } },
    { ...clone(), request: { ...demo.request, minutes: -1 } },
    { ...clone(), request: { ...demo.request, costCents: -1 } },
  ];
  for (const input of cases) rejection((await api('/api/proposals', input)).response.status);
  const published = await publish();
  const route = `/api/client/${token(published.clientPath)}/confirm`;
  rejection((await api(route, { optionId: 'imaginary' })).response.status);
  rejection((await api(route, { optionId: 'swap', totalCents: 1 })).response.status);
  rejection((await api(route, { optionId: ['swap'] })).response.status);
  assert.equal((await api<PublicProposal>(`/api/client/${token(published.clientPath)}`)).data.confirmation, null);
});

test('malformed, oversized, and cross-origin mutation requests fail safely', async () => {
  const requests: Array<{ body: string; contentType: string; status: number }> = [
    { body: '{"priceCents":', contentType: 'application/json', status: 400 },
    { body: '{"priceCents":Infinity}', contentType: 'application/json', status: 400 },
    { body: JSON.stringify(demo), contentType: 'text/plain', status: 400 },
    { body: JSON.stringify({ padding: 'x'.repeat(33000) }), contentType: 'application/json', status: 413 },
  ];
  for (const request of requests) {
    const response = await fetch(`${base}/api/proposals`, {
      method: 'POST', headers: { 'Content-Type': request.contentType }, body: request.body,
    });
    assert.equal(response.status, request.status);
    assert.match(response.headers.get('cache-control') ?? '', /no-store/i);
    const error = await response.json() as Record<string, unknown>;
    keys(error, ['error']);
    assert.equal(typeof error.error, 'string');
  }
  const published = await publish();
  const response = await fetch(`${base}/api/client/${token(published.clientPath)}/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.invalid' },
    body: JSON.stringify({ optionId: 'swap' }),
  });
  assert.equal(response.status, 403);
  const unchanged = await api<PublicProposal>(`/api/client/${token(published.clientPath)}`);
  assert.equal(unchanged.data.confirmation, null);
  assert.equal(unchanged.response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(unchanged.response.headers.get('x-content-type-options'), 'nosniff');
});

test('concurrent different choices save exactly one immutable result', async () => {
  const published = await publish();
  const route = `/api/client/${token(published.clientPath)}/confirm`;
  const results = await Promise.all([
    api<PublicProposal | { proposal: PublicProposal }>(route, { optionId: 'add' }),
    api<PublicProposal | { proposal: PublicProposal }>(route, { optionId: 'swap' }),
  ]);
  assert.deepEqual(results.map(x => x.response.status).sort(), [200, 409]);
  const winning = results.find(x => x.response.status === 200)!.data as PublicProposal;
  const losing = results.find(x => x.response.status === 409)!.data as { proposal: PublicProposal };
  assert.deepEqual(losing.proposal.confirmation, winning.confirmation);
  const saved = await api<PublicProposal>(`/api/client/${token(published.clientPath)}`);
  assert.deepEqual(saved.data.confirmation, winning.confirmation);
  const owner = await api<PrivateProposal>(`/api/owner/${token(published.ownerPath)}`);
  assert.deepEqual(owner.data.proposal.confirmation, winning.confirmation);
});

test('publications A and B are independent immutable snapshots', async () => {
  const input = clone();
  const a = await publish(input);
  input.request.costCents = 3000;
  input.request.name = 'Updated promo video';
  const b = await publish(input);
  assert.notEqual(a.clientPath, b.clientPath);
  assert.notEqual(a.ownerPath, b.ownerPath);
  const publicA = await api<PublicProposal>(`/api/client/${token(a.clientPath)}`);
  const publicB = await api<PublicProposal>(`/api/client/${token(b.clientPath)}`);
  assert.deepEqual(publicA.data, a.proposal);
  assert.equal(publicA.data.options[0].totalCents, 100000);
  assert.equal(publicB.data.options.length, 1);
  assert.equal(publicB.data.options[0].totalCents, 103000);
  assert.equal(publicB.data.options[0].extraCents, 33000);
  const ownerB = await api<PrivateProposal>(`/api/owner/${token(b.ownerPath)}`);
  assert.equal(ownerB.data.calculation.budgetGapCents, 3000);
  assert.deepEqual(publicB.data.options[0].added, ['Updated promo video']);
  rejection((await api(`/api/client/${token(b.clientPath)}/confirm`, { optionId: 'swap' })).response.status);
  await api(`/api/client/${token(a.clientPath)}/confirm`, { optionId: 'swap' });
  assert.equal((await api<PublicProposal>(`/api/client/${token(b.clientPath)}`)).data.confirmation, null);
  const confirmedB = await api<PublicProposal>(`/api/client/${token(b.clientPath)}/confirm`, { optionId: 'add' });
  assert.equal(confirmedB.response.status, 200);
  assert.equal((await api<PublicProposal>(`/api/client/${token(a.clientPath)}`)).data.confirmation?.optionId, 'swap');
  assert.equal(confirmedB.data.confirmation?.optionId, 'add');
});

test('a single no-extra-charge option can be confirmed', async () => {
  const input = clone();
  input.priceCents = 100000;
  const published = await publish(input);
  assert.equal(published.proposal.options.length, 1);
  assert.equal(published.proposal.options[0].id, 'add');
  assert.equal(published.proposal.options[0].totalCents, 100000);
  assert.equal(published.proposal.options[0].extraCents, 0);
  const accepted = await api<PublicProposal>(`/api/client/${token(published.clientPath)}/confirm`, { optionId: 'add' });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.data.confirmation?.optionId, 'add');
});

const persistencePhase = process.env.PERSISTENCE_PHASE;
test('write/read a saved proposal across an externally performed application restart', { skip: !persistencePhase }, async () => {
  const file = path.resolve('test-results/persistence-receipt.json');
  if (persistencePhase === 'write') {
    const published = await publish();
    const confirmed = await api<PublicProposal>(`/api/client/${token(published.clientPath)}/confirm`, { optionId: 'swap' });
    assert.equal(confirmed.response.status, 200);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ base, published, confirmation: confirmed.data.confirmation }), 'utf8');
  } else {
    assert.equal(persistencePhase, 'read');
    const saved = JSON.parse(await readFile(file, 'utf8')) as { base: string; published: Published; confirmation: PublicProposal['confirmation'] };
    assert.equal(saved.base, base);
    const client = await api<PublicProposal>(`/api/client/${token(saved.published.clientPath)}`);
    const owner = await api<PrivateProposal>(`/api/owner/${token(saved.published.ownerPath)}`);
    assert.equal(client.response.status, 200);
    assert.equal(owner.response.status, 200);
    assert.deepEqual(client.data.confirmation, saved.confirmation);
    assert.deepEqual(owner.data.proposal.confirmation, saved.confirmation);
    assert.deepEqual(client.data.options, saved.published.proposal.options);
  }
});
