import type { ProjectInput } from './types';

export const DEMO: ProjectInput = {
  priceCents: 70_000, minimumRateCents: 6_000,
  items: [
    { name: 'Core event materials', minutes: 300, costCents: 10_000, swappable: false },
    { name: 'Extra social media formats', minutes: 180, costCents: 0, swappable: true },
    { name: 'Print-ready version', minutes: 120, costCents: 0, swappable: true },
  ],
  request: { name: 'Short promo video', minutes: 300, costCents: 0 },
};

export const DEMO_REQUEST = 'Can you also make a short promo video? We still have the same budget.';
