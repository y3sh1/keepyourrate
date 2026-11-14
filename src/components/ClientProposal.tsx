'use client';

import { useEffect, useState } from 'react';
import type { PublicProposal } from '@/lib/types';
import { Header, Footer } from './Brand';
import { OptionCard } from './OptionCard';
import { formatMoney } from '@/lib/message';

export default function ClientProposal() {
  const [token, setToken] = useState('');
  const [proposal, setProposal] = useState<PublicProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const value = new URLSearchParams(window.location.search).get('token') || '';
    setToken(value); setLoading(true); setError('');
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(value)) { setError('This proposal link is invalid. Ask the sender for the complete client link.'); setLoading(false); return; }
    fetch(`/api/client/${value}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json() as PublicProposal & { error?: string; proposal?: PublicProposal };
      if (!response.ok) throw new Error(response.status === 404 ? 'This proposal link is invalid or no longer available. Ask the sender for a new link.' : 'We could not load the proposal. Please try again.');
      setProposal(data);
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message || 'We could not load the proposal. Please try again.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  async function confirm(optionId: 'add' | 'swap') {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/client/${token}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ optionId }) });
      const data = await response.json() as PublicProposal & { error?: string; proposal?: PublicProposal };
      if (!response.ok) {
        if (response.status === 409 && data.proposal) { setProposal(data.proposal); setError('A different option has already been confirmed. The saved choice is shown below and cannot be changed on this link.'); }
        else throw new Error(data.error || 'Your choice could not be saved. Please try again.');
      } else setProposal(data);
    } catch (error) { setError(error instanceof Error ? error.message : 'Connection interrupted. Please try again.'); }
    finally { setBusy(false); }
  }
  const selected = proposal?.options.find(option => option.id === proposal.confirmation?.optionId);
  return <><Header /><main className="proposal-page">
    {loading ? <div className="loading-state" role="status"><span className="spinner" /><h1>Opening your proposal…</h1><p>Getting the saved scope and prices.</p></div> : !proposal ? <div className="empty-state"><span className="state-icon">↗</span><h1>We couldn’t open this proposal.</h1><p role="alert">{error}</p><button className="button button-outline" onClick={() => setRetry(v => v + 1)}>Try again</button></div> : <>
      <div className="proposal-intro"><span className="eyebrow">{selected ? 'YOUR AGREED SCOPE' : 'A CLEAR WAY FORWARD'}</span><h1>{selected ? 'Confirmed. Everyone’s on the same page.' : proposal.options.length === 1 ? 'A little more work.\nA clear way forward.' : 'A little more work.\nTwo ways to make it fit.'}</h1>{!selected && proposal.options.length === 1 && <p className="single-option-note">One available option, with the complete scope below.</p>}<p>{selected ? 'Your choice is saved. Here is exactly what is included.' : 'Review the scope and final price, then confirm the option that works for you.'}</p><div className="proposal-meta"><span>Original budget <strong>{formatMoney(proposal.originalPriceCents)}</strong></span><span>All prices in USD</span></div></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {selected ? <><div className="confirmation-banner" role="status"><span className="success-icon">✓</span><div><strong>{selected.id === 'swap' ? 'Swap within budget' : 'Add to package'} confirmed</strong><p>{new Date(proposal.confirmation!.confirmedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZoneName: undefined })}</p></div><span className="confirmation-total">{formatMoney(selected.totalCents)}</span></div><div className="confirmed-option"><OptionCard option={selected} selected /></div><p className="confirmation-footnote">This choice is final for this proposal. For another change, ask your service provider for a new proposal. This confirms the scope and price; no payment has been collected.</p></> : <><div className={`client-options ${proposal.options.length === 1 ? 'single-option' : ''}`}>{proposal.options.map(option => <OptionCard key={option.id} option={option} busy={busy} onConfirm={() => confirm(option.id)} />)}</div><p className="confirmation-footnote">Confirming saves your selected scope and final price. You can choose once per proposal. No payment is collected here.</p></>}
    </>}
  </main><Footer /></>;
}

