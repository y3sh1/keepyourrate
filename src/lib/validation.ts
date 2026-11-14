import type { FieldErrors, ProjectInput } from './types';

export const LIMITS = { moneyCents: 1_000_000_000, rateCents: 100_000_000, minutes: 1_000_000, items: 12, name: 160 } as const;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validate the wire format without coercing strings, rounding, or dropping unknown fields. */
export function validateInput(value: unknown): { input?: ProjectInput; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const unknownKeys = (object: Record<string, unknown>, allowed: string[], path: string) => {
    if (Object.keys(object).some(key => !allowed.includes(key))) errors[path] = 'Unexpected fields are not accepted. Send project inputs only.';
  };
  const integer = (number: unknown, maximum: number, path: string, label: string) => {
    if (typeof number !== 'number' || !Number.isSafeInteger(number) || number < 0 || number > maximum) {
      errors[path] = `${label} must be a whole number from 0 to ${maximum.toLocaleString('en-US')}.`;
    }
  };
  const name = (text: unknown, path: string) => {
    if (typeof text !== 'string' || !text.trim()) errors[path] = 'Enter a name.';
    else if (text.length > LIMITS.name) errors[path] = `Use ${LIMITS.name} characters or fewer.`;
    else if (/[\u0000-\u001f\u007f]/.test(text)) errors[path] = 'Use a single line without control characters.';
  };
  if (!record(value)) return { errors: { _form: 'Enter a project with a price, rate, original items, and new request.' } };
  unknownKeys(value, ['priceCents', 'minimumRateCents', 'items', 'request'], '_form');
  integer(value.priceCents, LIMITS.moneyCents, 'priceCents', 'Price in cents');
  integer(value.minimumRateCents, LIMITS.rateCents, 'minimumRateCents', 'Minimum rate in cents per hour');
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > LIMITS.items) {
    errors.items = 'Add between 1 and 12 original items.';
  } else {
    value.items.forEach((item, index) => {
      const path = `items.${index}`;
      if (!record(item)) { errors[`${path}.name`] = 'Enter a valid original item.'; return; }
      unknownKeys(item, ['name', 'minutes', 'costCents', 'swappable'], path);
      name(item.name, `${path}.name`);
      integer(item.minutes, LIMITS.minutes, `${path}.minutes`, 'Time in minutes');
      integer(item.costCents, LIMITS.moneyCents, `${path}.costCents`, 'Direct expenses in cents');
      if (typeof item.swappable !== 'boolean') errors[`${path}.swappable`] = 'Choose whether this item can be swapped.';
    });
    if (value.items.every(item => record(item) && Number.isSafeInteger(item.minutes) && (item.minutes as number) >= 0) && value.items.reduce((sum, item) => sum + (item as Record<string, number>).minutes, 0) === 0) {
      errors.items = 'The original project must have more than zero total minutes.';
    }
  }
  if (!record(value.request)) errors['request.name'] = 'Enter the new request.';
  else {
    unknownKeys(value.request, ['name', 'minutes', 'costCents'], 'request');
    name(value.request.name, 'request.name');
    integer(value.request.minutes, LIMITS.minutes, 'request.minutes', 'Time in minutes');
    integer(value.request.costCents, LIMITS.moneyCents, 'request.costCents', 'Direct expenses in cents');
  }
  if (Object.keys(errors).length) return { errors };
  // A new object keeps later editor mutations away from the validated snapshot.
  const input = value as unknown as ProjectInput;
  return { input: { priceCents: input.priceCents, minimumRateCents: input.minimumRateCents, items: input.items.map(item => ({ ...item })), request: { ...input.request } }, errors };
}

export class InputValidationError extends Error {
  constructor(public readonly errors: FieldErrors) { super('Please correct the highlighted project inputs.'); this.name = 'InputValidationError'; }
}
