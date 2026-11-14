import type { PublicOption } from '@/lib/types';
import { formatMoney } from '@/lib/message';

export function confirmLabel(option: PublicOption) {
  return option.id === 'swap' ? `Confirm ${formatMoney(option.totalCents)} swap` : option.extraCents === 0 ? `Confirm ${formatMoney(option.totalCents)} package` : `Confirm ${formatMoney(option.totalCents)} add-on`;
}

export function OptionCard({ option, onConfirm, busy, selected, compact = false }: {
  option: PublicOption; onConfirm?: () => void; busy?: boolean; selected?: boolean; compact?: boolean;
}) {
  return <article className={`option-card ${option.id === 'swap' ? 'swap-card' : ''} ${selected ? 'selected-card' : ''} ${compact ? 'compact-card' : ''}`}>
    <div className="option-eyebrow"><span>{option.id === 'swap' ? '↔' : '+'} {option.id === 'swap' ? 'Swap within budget' : 'Add to package'}</span>{selected && <span className="tag confirmed-tag">✓ Confirmed</span>}</div>
    <div className="option-price">{formatMoney(option.totalCents)}<span>total</span></div>
    <p className="option-extra">{option.extraCents > 0 ? `+${formatMoney(option.extraCents)} ${selected ? 'agreed' : 'proposed'} additional cost` : 'No additional cost'}</p>
    <div className="scope-sections">
      {option.unchanged.length > 0 && <section><h4><span aria-hidden="true">—</span> Unchanged</h4><ul>{option.unchanged.map((name, i) => <li key={i}>{name}</li>)}</ul></section>}
      {option.added.length > 0 && <section className="scope-added"><h4><span aria-hidden="true">+</span> Added</h4><ul>{option.added.map((name, i) => <li key={i}>{name}</li>)}</ul></section>}
      {option.removed.length > 0 && <section className="scope-removed"><h4><span aria-hidden="true">−</span> Removed</h4><ul>{option.removed.map((name, i) => <li key={i}>{name}</li>)}</ul></section>}
    </div>
    {onConfirm && <button className={`button ${option.id === 'swap' ? 'button-outline' : 'button-primary'} confirm-button`} onClick={onConfirm} disabled={busy}>{busy ? 'Saving your choice…' : confirmLabel(option)}</button>}
  </article>;
}
