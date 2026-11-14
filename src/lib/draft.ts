import type { ProjectInput } from './types';

export type DraftItem = { name: string; minutes: string; costCents: string; swappable: boolean };
export type Draft = {
  priceCents: string;
  minimumRateCents: string;
  items: DraftItem[];
  request: Omit<DraftItem, 'swappable'>;
};
export type DraftMode = 'demo' | 'project';
export interface SavedDraft { version: 1; draft: Draft; mode: DraftMode; savedAt: string }

export const DRAFT_KEY = 'keepyourrate:draft:v1';
export const HANDOFF_KEY = 'keepyourrate:proposal-draft:v1';
const MAX_BYTES = 64 * 1024;
const MAX_NUMERIC_TEXT = 200;
const MAX_NAME_TEXT = 1000;

function dollars(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new TypeError('Expected nonnegative integer cents.');
  const amount = BigInt(cents);
  const fraction = amount % 100n;
  return `${amount / 100n}${fraction ? `.${String(fraction).padStart(2, '0')}` : ''}`;
}

/** Only project inputs cross into a new draft; links and confirmation never do. */
export function asDraft(input: ProjectInput): Draft {
  return {
    priceCents: dollars(input.priceCents),
    minimumRateCents: dollars(input.minimumRateCents),
    items: input.items.map(item => ({
      name: item.name, minutes: String(item.minutes), costCents: dollars(item.costCents), swappable: item.swappable,
    })),
    request: { name: input.request.name, minutes: String(input.request.minutes), costCents: dollars(input.request.costCents) },
  };
}

export function emptyDraft(): Draft {
  return { priceCents: '', minimumRateCents: '', items: [{ name: '', minutes: '', costCents: '0', swappable: false }], request: { name: '', minutes: '', costCents: '0' } };
}

function exactRecord(value: unknown, keys: string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype
    && Object.keys(value).length === keys.length
    && keys.every(key => Object.hasOwn(value, key));
}

function text(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length <= maximum;
}

function draftShape(value: unknown): value is Draft {
  if (!exactRecord(value, ['priceCents', 'minimumRateCents', 'items', 'request'])
    || !text(value.priceCents, MAX_NUMERIC_TEXT) || !text(value.minimumRateCents, MAX_NUMERIC_TEXT)
    || !Array.isArray(value.items) || value.items.length < 1 || value.items.length > 12) return false;
  if (!value.items.every(item => exactRecord(item, ['name', 'minutes', 'costCents', 'swappable'])
    && text(item.name, MAX_NAME_TEXT) && text(item.minutes, MAX_NUMERIC_TEXT)
    && text(item.costCents, MAX_NUMERIC_TEXT) && typeof item.swappable === 'boolean')) return false;
  const request = value.request;
  return exactRecord(request, ['name', 'minutes', 'costCents']) && text(request.name, MAX_NAME_TEXT)
    && text(request.minutes, MAX_NUMERIC_TEXT) && text(request.costCents, MAX_NUMERIC_TEXT);
}

/** Draft validation checks the storage shape, not whether unfinished inputs can be published. */
export function parseSavedDraft(raw: string | null): SavedDraft | null {
  if (!raw || raw.length > MAX_BYTES || new TextEncoder().encode(raw).byteLength > MAX_BYTES) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!exactRecord(value, ['version', 'draft', 'mode', 'savedAt']) || value.version !== 1
      || (value.mode !== 'demo' && value.mode !== 'project') || !draftShape(value.draft)
      || typeof value.savedAt !== 'string' || !Number.isFinite(Date.parse(value.savedAt))) return null;
    if (new Date(value.savedAt).toISOString() !== value.savedAt) return null;
    return value as unknown as SavedDraft;
  } catch { return null; }
}

/** Explicit allowlist also protects against accidentally serializing a proposal object. */
export function serializeDraft(draft: Draft, mode: DraftMode): string {
  const saved: SavedDraft = {
    version: 1, mode, savedAt: new Date().toISOString(),
    draft: {
      priceCents: draft.priceCents, minimumRateCents: draft.minimumRateCents,
      items: draft.items.map(item => ({ name: item.name, minutes: item.minutes, costCents: item.costCents, swappable: item.swappable })),
      request: { name: draft.request.name, minutes: draft.request.minutes, costCents: draft.request.costCents },
    },
  };
  const raw = JSON.stringify(saved);
  if (!parseSavedDraft(raw)) throw new TypeError('This draft is too large or has an unsupported format.');
  return raw;
}
