import type { PublicOption, PublicProposal } from './types';

export function formatMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

function describe(option: PublicOption): string {
  const changes = [
    option.unchanged.length ? `Unchanged: ${option.unchanged.join('; ')}.` : '',
    option.added.length ? `Added: ${option.added.join('; ')}.` : '',
    option.removed.length ? `Removed: ${option.removed.join('; ')}.` : '',
  ].filter(Boolean).join('\n');
  return `${option.title}: ${formatMoney(option.totalCents)} total (${option.extraCents ? `${formatMoney(option.extraCents)} extra` : 'no extra charge'}).\n${changes}`;
}

/** Receives only a published public snapshot, never editor inputs or owner access. */
export function buildClientMessage(proposal: PublicProposal, absoluteClientUrl: string): string {
  if (proposal.confirmation) {
    const chosen = proposal.options.find(option => option.id === proposal.confirmation!.optionId);
    if (!chosen) throw new Error('The saved confirmation does not match an available option.');
    return `Hi! Thanks for confirming the updated scope. Here is what we agreed:\n\n${describe(chosen)}\n\nView the agreed scope:\n${absoluteClientUrl}`;
  }
  return `Hi! Thanks for the additional request. I've put together ${proposal.options.length === 1 ? 'an updated option' : 'two options'} for you:\n\n${proposal.options.map(describe).join('\n\n')}\n\n${proposal.options.length === 1 ? 'Review and confirm the updated scope' : 'Choose the option that works best for you'}:\n${absoluteClientUrl}`;
}
