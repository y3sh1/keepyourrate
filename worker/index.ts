import { calculate } from '../src/lib/calculation';
import { validateInput } from '../src/lib/validation';
import type { ProjectInput, Calculation, PublicProposal, PublicOption } from '../src/lib/types';

interface Env { DB: D1Database; ASSETS: Fetcher }
interface Snapshot { input: ProjectInput; calculation: Calculation }
interface Row { snapshot: string; client_token: string; created_at: string; chosen_option: 'add' | 'swap' | null; confirmed_at: string | null }
const securityHeaders = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};
function json(value: unknown, status = 200) { return Response.json(value, { status, headers: securityHeaders }); }
function token() { return Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''); }
async function hash(value: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join(''); }
function publicOption(o: PublicOption): PublicOption {
  return { id: o.id, title: o.title, totalCents: o.totalCents, extraCents: o.extraCents, unchanged: [...o.unchanged], added: [...o.added], removed: [...o.removed] };
}
// Explicit allowlist. Never serialize the stored row or snapshot into a public response.
function publicProposal(row: Row): PublicProposal {
  const snapshot = JSON.parse(row.snapshot) as Snapshot;
  return { createdAt: row.created_at, originalPriceCents: snapshot.input.priceCents,
    options: snapshot.calculation.options.map(publicOption),
    confirmation: row.chosen_option && row.confirmed_at ? { optionId: row.chosen_option, confirmedAt: row.confirmed_at } : null };
}
async function readBody(request: Request): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new Error('JSON_REQUIRED');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('BAD_JSON');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    length += value.byteLength;
    if (length > 32768) { await reader.cancel(); throw new Error('BODY_LIMIT'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const part of chunks) { bytes.set(part, offset); offset += part.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new Error('BAD_JSON'); }
}
async function api(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.DB) return json({ error: 'Storage is not configured. Please try again later.' }, 503);
  if (request.method === 'POST') {
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'This request is not allowed.' }, 403);
  }
  if (url.pathname === '/api/proposals' && request.method === 'POST') {
    const parsed = validateInput(await readBody(request));
    if (!parsed.input || Object.keys(parsed.errors).length) return json({ error: 'Please check the highlighted fields.', errors: parsed.errors }, 400);
    const input = parsed.input;
    const calculation = calculate(input); // Server owns all prices and scope.
    const clientToken = token(), ownerToken = token(), createdAt = new Date().toISOString();
    const row: Row = { snapshot: JSON.stringify({ input, calculation }), client_token: clientToken, created_at: createdAt, chosen_option: null, confirmed_at: null };
    await env.DB.prepare('INSERT INTO proposals (id, client_hash, owner_hash, client_token, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(crypto.randomUUID(), await hash(clientToken), await hash(ownerToken), clientToken, row.snapshot, createdAt).run();
    return json({ clientPath: `/offer/?token=${clientToken}`, ownerPath: `/status/?token=${ownerToken}`, proposal: publicProposal(row) }, 201);
  }
  const match = url.pathname.match(/^\/api\/(client|owner)\/([a-f0-9]{64})(\/confirm)?$/);
  if (!match) return json({ error: 'This link is invalid or unavailable.' }, 404);
  const [, role, accessToken, confirm] = match;
  const accessHash = await hash(accessToken);
  if (confirm && role === 'client' && request.method === 'POST') {
    const body = await readBody(request);
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1 || !('optionId' in body) || typeof body.optionId !== 'string' || !['add', 'swap'].includes(body.optionId)) {
      return json({ error: 'Choose an available option.' }, 400);
    }
    const optionId = String(body.optionId);
    // One compare-and-set UPDATE, also checking membership in the saved snapshot.
    const won = await env.DB.prepare(`UPDATE proposals SET chosen_option = ?, confirmed_at = ?
      WHERE client_hash = ? AND chosen_option IS NULL
      AND EXISTS (SELECT 1 FROM json_each(proposals.snapshot, '$.calculation.options') WHERE json_extract(value, '$.id') = ?)
      RETURNING snapshot, client_token, created_at, chosen_option, confirmed_at`)
      .bind(optionId, new Date().toISOString(), accessHash, optionId).first<Row>();
    if (won) return json(publicProposal(won));
    const row = await env.DB.prepare('SELECT snapshot, client_token, created_at, chosen_option, confirmed_at FROM proposals WHERE client_hash = ?').bind(accessHash).first<Row>();
    if (!row) return json({ error: 'This link is invalid or unavailable.' }, 404);
    const proposal = publicProposal(row);
    if (!proposal.options.some(o => o.id === optionId)) return json({ error: 'Choose an available option.' }, 400);
    if (row.chosen_option === optionId) return json(proposal);
    return json({ error: 'This proposal is already confirmed. The saved choice cannot be changed.', proposal }, 409);
  }
  if (confirm || request.method !== 'GET') return json({ error: 'This action is unavailable.' }, 405);
  const query = role === 'owner'
    ? 'SELECT snapshot, client_token, created_at, chosen_option, confirmed_at FROM proposals WHERE owner_hash = ?'
    : 'SELECT snapshot, client_token, created_at, chosen_option, confirmed_at FROM proposals WHERE client_hash = ?';
  const row = await env.DB.prepare(query).bind(accessHash).first<Row>();
  if (!row) return json({ error: 'This link is invalid or unavailable.' }, 404);
  const proposal = publicProposal(row);
  if (role === 'client') return json(proposal);
  const snapshot = JSON.parse(row.snapshot) as Snapshot;
  return json({ proposal, input: snapshot.input, calculation: snapshot.calculation, clientPath: `/offer/?token=${row.client_token}` });
}
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/api/')) return await api(request, env, url);
      const response = await env.ASSETS.fetch(request);
      const headers = new Headers(response.headers);
      for (const [key, value] of Object.entries(securityHeaders)) headers.set(key, value);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (message === 'BODY_LIMIT') return json({ error: 'The proposal is too large. Use at most 12 items with names up to 160 characters.' }, 413);
      if (message === 'JSON_REQUIRED' || message === 'BAD_JSON') return json({ error: 'Send a valid JSON request.' }, 400);
      return json({ error: 'We could not save or load this proposal. Your entered data has been kept. Please try again.' }, 503);
    }
  },
};
