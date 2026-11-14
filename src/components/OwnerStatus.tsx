'use client';

import { useCallback, useEffect, useState } from 'react';
import type { PrivateProposal } from '@/lib/types';
import { Header, Footer } from './Brand';
import { OptionCard } from './OptionCard';
import { buildClientMessage, formatMoney } from '@/lib/message';

export default function OwnerStatus() {
  const [record, setRecord] = useState<PrivateProposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copyStatus, setCopyStatus] = useState('');
  const [copying, setCopying] = useState(false);
  const [fallback, setFallback] = useState('');
  const load = useCallback(async (manual = false) => {
    const token = new URLSearchParams(window.location.search).get('token') || '';
    if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) { setError('This private link is invalid. Use the full private status link saved when you published.'); setLoading(false); return null; }
    try {
      const response = await fetch(`/api/owner/${token}`, { cache: 'no-store' });
      const data = await response.json() as PrivateProposal & { error?: string };
      if (!response.ok) throw new Error(response.status === 404 ? 'This private link is invalid. Use the private status link, not the client link.' : 'Could not check the status. Please try again.');
      if (record?.proposal.confirmation?.optionId !== data.proposal.confirmation?.optionId) { setFallback(''); setCopyStatus(''); }
      setRecord(data); setError(''); return data as PrivateProposal;
    } catch (error) { if (manual || !record) setError(error instanceof Error ? error.message : 'Could not check the status. Please try again.'); return null; }
    finally { setLoading(false); }
  }, [record]);
  useEffect(() => { void load(true); }, []); // The polling timer below always uses the latest callback.
  useEffect(() => { const timer = setInterval(() => { void load(); }, 5000); return () => clearInterval(timer); }, [load]);
  async function copyMessage() {
    setCopying(true); setCopyStatus(''); setFallback('');
    const latest = await load(true);
    if (latest) {
      const message = buildClientMessage(latest.proposal, new URL(latest.clientPath, window.location.origin).href);
      try { await navigator.clipboard.writeText(message); setCopyStatus('Message copied. Ready to send.'); setFallback(''); }
      catch { setFallback(message); setCopyStatus('Select and copy the message below.'); }
    } else setCopyStatus('Could not prepare the latest message. Please try again.');
    setCopying(false);
  }
  const proposal = record?.proposal;
  const selected = proposal?.options.find(option => option.id === proposal.confirmation?.optionId);
  return <><Header privateView /><main className="proposal-page owner-page">
    {loading ? <div className="loading-state" role="status"><span className="spinner" /><h1>Checking your proposal…</h1></div> : !record || !proposal ? <div className="empty-state"><span className="state-icon">↗</span><h1>We couldn’t open this status link.</h1><p role="alert">{error}</p><button className="button button-outline" onClick={() => load(true)}>Try again</button></div> : <>
      <div className="proposal-intro"><div className="eyebrow">PRIVATE PROPOSAL STATUS</div><h1>{selected ? 'The new scope is agreed.' : 'Your proposal is ready.\nThe next move is theirs.'}</h1><p>{selected ? 'Your client’s choice is saved, with the scope and price below.' : 'Share the client link and check back here. This page updates automatically.'}</p><div className="status-toolbar"><span className={`tag ${selected ? 'confirmed-tag' : 'waiting-tag'}`}>{selected ? '✓ Confirmed' : '◷ Awaiting client confirmation'}</span><button className="text-button" onClick={() => load(true)}>Refresh status ↻</button></div></div>
      {error && <div className="error-banner" role="alert">{error}</div>}
      {selected && <div className="confirmation-banner" role="status"><span className="success-icon">✓</span><div><strong>{selected.id === 'swap' ? 'Swap within budget' : 'Add to package'} confirmed</strong><p>{new Date(proposal.confirmation!.confirmedAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><span className="confirmation-total">{formatMoney(selected.totalCents)}</span></div>}
      <div className={`client-options ${selected || proposal.options.length === 1 ? 'single-option' : ''}`}>{(selected ? [selected] : proposal.options).map(option => <OptionCard key={option.id} option={option} selected={!!selected} />)}</div>
      <div className="owner-share-panel"><div><h3>{selected ? 'Share the agreed scope.' : 'Start a clearer conversation.'}</h3><p>{selected ? 'The message includes only the confirmed option.' : 'A ready-to-send message with prices, scope changes and the client link.'}</p><a href={record.clientPath} target="_blank" rel="noopener noreferrer">Open client proposal ↗</a></div><button className="button button-primary" disabled={copying} onClick={copyMessage}>{copying ? 'Preparing message…' : 'Copy message to client'}</button><p className="copy-status" role="status">{copyStatus}</p>{fallback && <textarea className="message-fallback" aria-label="Client message to copy" value={fallback} readOnly onFocus={e => e.target.select()} />}</div>
      <details className="snapshot-details"><summary>View your original calculation <span>Private to this link</span></summary><div className="snapshot-body"><div className="snapshot-stats"><div><span>Original price</span><strong>{formatMoney(record.input.priceCents)}</strong></div><div><span>Minimum rate to protect</span><strong>{formatMoney(record.input.minimumRateCents)}/hour</strong></div><div><span>Current effective rate</span><strong>{formatMoney(Math.round(record.calculation.currentRateCents))}/hour</strong></div></div><p className="rate-explainer">Estimated hourly rate after stated direct expenses, based on entered time.</p><ul>{record.input.items.map((item, i) => <li key={i}><strong>{item.name}</strong><span>{item.minutes} minutes · {formatMoney(item.costCents)} direct expenses · {item.swappable ? 'Can be swapped' : 'Required'}</span></li>)}<li><strong>New: {record.input.request.name}</strong><span>{record.input.request.minutes} minutes · {formatMoney(record.input.request.costCents)} direct expenses</span></li></ul></div></details>
      <p className="confirmation-footnote">Keep this link private. Anyone with it can view these project details. Published {new Date(proposal.createdAt).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}. Each new publication is independent. No payment is collected here.</p>
    </>}
  </main><Footer /></>;
}

