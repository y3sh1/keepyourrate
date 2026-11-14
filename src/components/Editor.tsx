'use client';

import { useMemo, useRef, useState } from 'react';
import { calculate } from '@/lib/calculation';
import { validateInput } from '@/lib/validation';
import { DEMO } from '@/lib/demo';
import { buildClientMessage, formatMoney } from '@/lib/message';
import type { FieldErrors, ProjectInput, Published, PublicProposal } from '@/lib/types';
import { Brand, Footer } from './Brand';
import { OptionCard } from './OptionCard';

type DraftItem = { name: string; minutes: string; costCents: string; swappable: boolean };
type Draft = { priceCents: string; minimumRateCents: string; items: DraftItem[]; request: Omit<DraftItem, 'swappable'> };
const asDraft = (input: ProjectInput): Draft => ({ priceCents: String(input.priceCents / 100), minimumRateCents: String(input.minimumRateCents / 100), items: input.items.map(item => ({ ...item, minutes: String(item.minutes), costCents: String(item.costCents / 100) })), request: { ...input.request, minutes: String(input.request.minutes), costCents: String(input.request.costCents / 100) } });
const emptyDraft = (): Draft => ({ priceCents: '', minimumRateCents: '', items: [{ name: '', minutes: '', costCents: '0', swappable: false }], request: { name: '', minutes: '', costCents: '0' } });

function parseDraft(draft: Draft) {
  const errors: FieldErrors = {};
  function number(value: string, path: string, money = false) {
    if (!(money ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(value)) {
      errors[path] = money ? 'Enter a nonnegative amount with up to 2 decimal places.' : 'Enter a nonnegative whole number of minutes.';
      return NaN;
    }
    const [whole, fraction = ''] = value.split('.');
    const parsed = money ? BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) : BigInt(whole);
    if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) { errors[path] = 'This value is outside the supported range.'; return NaN; }
    return Number(parsed);
  }
  const value = {
    priceCents: number(draft.priceCents, 'priceCents', true), minimumRateCents: number(draft.minimumRateCents, 'minimumRateCents', true),
    items: draft.items.map((item, i) => ({ ...item, minutes: number(item.minutes, `items.${i}.minutes`), costCents: number(item.costCents, `items.${i}.costCents`, true) })),
    request: { ...draft.request, minutes: number(draft.request.minutes, 'request.minutes'), costCents: number(draft.request.costCents, 'request.costCents', true) },
  };
  const validated = validateInput(value);
  return { input: Object.keys(errors).length ? undefined : validated.input, errors: { ...validated.errors, ...errors } };
}

function Rate({ cents }: { cents: number }) { return <>{formatMoney(Math.round(cents))}<small>/hour</small></>; }

export default function Editor() {
  const [draft, setDraft] = useState<Draft>(() => asDraft(DEMO));
  const [mode, setMode] = useState<'demo' | 'project'>('demo');
  const [showErrors, setShowErrors] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [serverErrors, setServerErrors] = useState<FieldErrors>({});
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');
  const [published, setPublished] = useState<Published | null>(null);
  const [copied, setCopied] = useState('');
  const [copying, setCopying] = useState(false);
  const [messageFallback, setMessageFallback] = useState('');
  const editorRef = useRef<HTMLElement>(null);
  const publishedRef = useRef<HTMLDivElement>(null);
  const parsed = useMemo(() => parseDraft(draft), [draft]);
  const calculation = useMemo(() => parsed.input ? calculate(parsed.input) : null, [parsed.input]);
  const errors = { ...parsed.errors, ...serverErrors };
  const demoCalculation = useMemo(() => calculate(DEMO), []);

  function openEditor(nextMode: 'demo' | 'project') {
    setMode(nextMode); setDraft(nextMode === 'demo' ? asDraft(DEMO) : emptyDraft()); setShowErrors(false); setTouched({}); setServerErrors({}); setPublishError('');
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  function update(mutator: (current: Draft) => Draft) { setDraft(mutator); setServerErrors({}); setPublishError(''); }
  function fieldError(path: string) {
    const error = (showErrors || touched[path]) ? errors[path] : undefined;
    if (!error) return undefined;
    if (error.includes('in cents') && path === 'minimumRateCents') return 'Enter a rate from $0 to $1,000,000 per hour.';
    if (error.includes('in cents')) return 'Enter an amount from $0 to $10,000,000.';
    return error;
  }
  function inputProps(path: string) { return { id: path, 'aria-invalid': !!fieldError(path), 'aria-describedby': fieldError(path) ? `${path}-error` : undefined, onBlur: () => setTouched(v => ({ ...v, [path]: true })) }; }
  function errorText(path: string) { return fieldError(path) ? <span className="field-error" id={`${path}-error`} role={path === 'items' ? 'alert' : undefined} tabIndex={path === 'items' ? -1 : undefined}>{fieldError(path)}</span> : null; }
  async function publish() {
    setShowErrors(true); setPublishError('');
    if (!parsed.input) { requestAnimationFrame(() => { const target = document.querySelector<HTMLElement>('[aria-invalid="true"]') || document.getElementById('items-error'); target?.focus(); }); return; }
    setPublishing(true);
    try {
      const response = await fetch('/api/proposals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.input) });
      const data = await response.json() as Published & { error?: string; errors?: FieldErrors };
      if (!response.ok) { if (data.errors) setServerErrors(data.errors); throw new Error(data.error || 'Your proposal could not be saved. Please try again.'); }
      setPublished(data); setCopied(''); setMessageFallback('');
      requestAnimationFrame(() => publishedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
    } catch (error) { setPublishError(error instanceof Error ? error.message : 'Connection interrupted. Your inputs are still here. Please try again.'); }
    finally { setPublishing(false); }
  }
  async function copyMessage() {
    if (!published) return;
    setCopying(true); setCopied(''); setMessageFallback('');
    try {
      const clientUrl = new URL(published.clientPath, window.location.origin);
      const response = await fetch(`/api/client/${clientUrl.searchParams.get('token')}`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Could not check the latest status. Please try again.');
      const proposal = await response.json() as PublicProposal;
      setPublished({ ...published, proposal });
      const message = buildClientMessage(proposal, clientUrl.href);
      try { await navigator.clipboard.writeText(message); setCopied('Message copied. Ready to send.'); setMessageFallback(''); }
      catch { setMessageFallback(message); setCopied('Select and copy the message below.'); }
    } catch (error) { setCopied(error instanceof Error ? error.message : 'Could not prepare your message. Please try again.'); }
    finally { setCopying(false); }
  }

  return <>
    <header className="site-header"><Brand /><div className="header-right"><span className="header-note">Built for independent work</span><a href="#editor" className="nav-link">Open editor <span aria-hidden="true">↗</span></a></div></header>
    <main>
      <section className="hero">
        <div className="hero-copy"><div className="eyebrow"><span className="status-dot" /> A fair way to say yes</div><h1>Your client wants more.<br /><em>Keep your hourly rate.</em></h1><p className="hero-description">Turn extra requests into a paid add-on or a swap within budget.</p><div className="hero-actions"><button className="button button-primary" onClick={() => openEditor('demo')}>Try the demo <span aria-hidden="true">↗</span></button><button className="button button-outline" onClick={() => openEditor('project')}>Check my project</button></div><p className="hero-assurance">No sign-up. No awkward math. Just a clearer conversation.</p></div>
        <div className="hero-visual" aria-label="An editable example of a scope change"><div className="paper-top"><span className="tiny-label">THE EXTRA REQUEST</span><span className="paper-dots">•••</span></div><blockquote>“Can you also make a short promo video? We still have the same budget.”</blockquote><div className="flow-line"><span />Two clear ways forward<span /></div><div className="mini-options"><div><span className="mini-icon">+</span><p>Keep everything</p><strong>{formatMoney(demoCalculation.options[0].totalCents)}</strong><small>Include the extra work</small></div><div><span className="mini-icon">↔</span><p>Keep the budget</p><strong>{formatMoney(DEMO.priceCents)}</strong><small>Make room with a swap</small></div></div><div className="paper-foot"><span className="check-circle">✓</span>Your minimum rate stays protected.</div><span className="floating-note">A little clarity.<br />A lot less scope creep.</span></div>
      </section>

      <section className="editor-section" id="editor" ref={editorRef}>
        <div className="section-heading"><div><div className="eyebrow">YOUR SCOPE, REBALANCED</div><h2>Make room for the request.</h2></div><div className="segmented" aria-label="Editor mode"><button aria-pressed={mode === 'demo'} onClick={() => openEditor('demo')}>Demo project</button><button aria-pressed={mode === 'project'} onClick={() => openEditor('project')}>My project</button></div></div>
        {mode === 'demo' && <div className="demo-note"><span className="tag">EDITABLE DEMO</span><p>Event materials · Change any number or mark an item as required to see what changes.</p></div>}
        <div className="editor-layout"><div className="editor-inputs">
          <section className="form-panel"><div className="panel-heading"><span className="step-number">01</span><div><h3>The original agreement</h3><p>The fixed price and the rate you want to protect.</p></div></div><div className="two-fields"><label className="field"><span>Agreed project price</span><div className="input-with-prefix"><span>$</span><input {...inputProps('priceCents')} inputMode="decimal" value={draft.priceCents} onChange={e => update(v => ({ ...v, priceCents: e.target.value }))} placeholder="700" /></div>{errorText('priceCents')}</label><label className="field"><span>Minimum rate to protect</span><div className="input-with-prefix"><span>$</span><input {...inputProps('minimumRateCents')} inputMode="decimal" value={draft.minimumRateCents} onChange={e => update(v => ({ ...v, minimumRateCents: e.target.value }))} placeholder="60" /><span className="input-suffix">/hr</span></div>{errorText('minimumRateCents')}<span className="field-hint">{calculation ? `Current effective rate: ${formatMoney(Math.round(calculation.currentRateCents))}/hour` : 'Your minimum may differ from your current rate.'}</span></label></div>
            {calculation && parsed.input && parsed.input.minimumRateCents < calculation.currentRateCents && <p className="inline-note">Your chosen minimum is below your current rate. These options protect {formatMoney(parsed.input.minimumRateCents)}/hour.</p>}
            <div className="items-heading"><h4>Original scope</h4><span>Up to 12 items</span></div>
            <div className="work-items">{draft.items.map((item, i) => <div className="work-item" key={i}><div className="item-top"><label className="field item-name"><span>Item {i + 1}</span><input {...inputProps(`items.${i}.name`)} value={item.name} maxLength={160} placeholder="Name a deliverable or task" onChange={e => update(v => ({ ...v, items: v.items.map((it, j) => j === i ? { ...it, name: e.target.value } : it) }))} />{errorText(`items.${i}.name`)}</label>{draft.items.length > 1 && <button className="remove-item" aria-label={`Remove item ${i + 1}`} onClick={() => update(v => ({ ...v, items: v.items.filter((_, j) => j !== i) }))}>×</button>}</div><div className="item-details"><label className="field"><span>Time <small>(minutes)</small></span><input {...inputProps(`items.${i}.minutes`)} inputMode="numeric" value={item.minutes} onChange={e => update(v => ({ ...v, items: v.items.map((it, j) => j === i ? { ...it, minutes: e.target.value } : it) }))} />{errorText(`items.${i}.minutes`)}</label><label className="field"><span>Direct expenses</span><div className="input-with-prefix"><span>$</span><input {...inputProps(`items.${i}.costCents`)} inputMode="decimal" value={item.costCents} onChange={e => update(v => ({ ...v, items: v.items.map((it, j) => j === i ? { ...it, costCents: e.target.value } : it) }))} /></div>{errorText(`items.${i}.costCents`)}</label><label className="swap-checkbox"><input type="checkbox" checked={item.swappable} onChange={e => update(v => ({ ...v, items: v.items.map((it, j) => j === i ? { ...it, swappable: e.target.checked } : it) }))} /><span>Can be swapped<small>{item.swappable ? 'May be removed' : 'Required in every option'}</small></span></label></div></div>)}</div>
            {errorText('items')}<button className="text-button add-item" disabled={draft.items.length >= 12} onClick={() => update(v => ({ ...v, items: [...v.items, { name: '', minutes: '', costCents: '0', swappable: false }] }))}>+ Add an original item</button><p className="field-hint">60 minutes = 1 hour. Include only expenses directly tied to the work.</p>
          </section>
          <section className="form-panel request-panel"><div className="panel-heading"><span className="step-number">02</span><div><h3>The new request</h3><p>One item can include several related tasks.</p></div><span className="new-tag">NEW</span></div><label className="field"><span>What is the client asking for?</span><input {...inputProps('request.name')} value={draft.request.name} maxLength={160} placeholder="Describe the additional work" onChange={e => update(v => ({ ...v, request: { ...v.request, name: e.target.value } }))} />{errorText('request.name')}</label><div className="two-fields"><label className="field"><span>Time <small>(minutes)</small></span><input {...inputProps('request.minutes')} inputMode="numeric" value={draft.request.minutes} onChange={e => update(v => ({ ...v, request: { ...v.request, minutes: e.target.value } }))} />{errorText('request.minutes')}</label><label className="field"><span>Direct expenses</span><div className="input-with-prefix"><span>$</span><input {...inputProps('request.costCents')} inputMode="decimal" value={draft.request.costCents} onChange={e => update(v => ({ ...v, request: { ...v.request, costCents: e.target.value } }))} /></div>{errorText('request.costCents')}</label></div></section>
        </div>
        <aside className="editor-results"><div className="results-sticky"><div className="results-heading"><span className="eyebrow">THE NUMBERS, IN REAL TIME</span><span className="live-badge"><span className="status-dot" />Live</span></div>
          {calculation ? <><div className="rate-summary" aria-live="polite"><div className="rate-row"><span>Current rate</span><strong><Rate cents={calculation.currentRateCents} /></strong></div><div className="rate-row free-rate"><span>If added for free</span><strong><Rate cents={calculation.freeRateCents} />{calculation.changePercent !== null && <b className="percent-change">{calculation.changePercent < 0 ? '−' : '+'}{Math.abs(calculation.changePercent).toFixed(1)}%</b>}</strong></div><div className="keep-everything"><span>Keep everything</span><strong>+{formatMoney(calculation.options[0].extraCents)}</strong></div></div><p className="rate-explainer">Estimated hourly rate after your stated direct expenses, based on the time you enter.</p><div className="options-heading"><h3>Your proposal options</h3><span>{calculation.options.length} {calculation.options.length === 1 ? 'option' : 'options'}</span></div><div className="editor-options">{calculation.options.map(option => <OptionCard key={option.id} option={option} compact />)}</div>{calculation.budgetGapCents !== null && <div className="no-swap"><span aria-hidden="true">↔</span><div><strong>No swap fits this budget</strong><p>Even after the allowed removals, the budget is short by {formatMoney(calculation.budgetGapCents)}. This is an explanation, not a third offer.</p></div></div>}<p className="algorithm-note">Swaps remove the fewest items, then the least time. You decide what matters to your client.</p></> : <div className="empty-calculation"><span>↗</span><h3>A clear answer starts here.</h3><p>Complete the project details to see your rates and available options.</p>{showErrors && <p className="field-error">Please fix the highlighted fields to continue.</p>}</div>}
          <div className="publish-area"><button className="button button-primary publish-button" onClick={publish} disabled={publishing}>{publishing ? 'Publishing proposal…' : 'Publish proposal'} <span aria-hidden="true">↗</span></button><p>Creates a client link and a separate private status link.<br />Your hours, expenses and minimum rate stay private.</p>{publishError && <div className="error-banner" role="alert">{publishError}</div>}</div>
        </div></aside></div>
        {published && <div className="published-panel" ref={publishedRef} tabIndex={-1}><div className="published-heading"><span className="success-icon">✓</span><div><div className="eyebrow">SAVED & READY TO SHARE</div><h3>{published.proposal.confirmation ? 'Your client has confirmed.' : 'Your proposal has its own home.'}</h3><p>This published snapshot stays the same when you edit above. Publish again to create a new proposal.</p></div></div><div className="published-links"><div><span className="tiny-label">CLIENT LINK</span><a href={published.clientPath} target="_blank" rel="noopener noreferrer">Open client proposal ↗</a><p>Share this link with your client.</p></div><div><span className="tiny-label">PRIVATE STATUS LINK</span><a href={published.ownerPath} target="_blank" rel="noopener noreferrer">Open your private status ↗</a><p>Save this link. Anyone with it can view your project details.</p></div></div><button className="button button-primary" disabled={copying} onClick={copyMessage}>{copying ? 'Preparing message…' : 'Copy message to client'}</button><p className="copy-status" role="status">{copied}</p>{messageFallback && <textarea className="message-fallback" aria-label="Client message to copy" readOnly value={messageFallback} onFocus={e => e.target.select()} />}</div>}
      </section>
      <section className="closing-note"><span className="brand-mark" aria-hidden="true">k<span>↗</span></span><p>Say yes to the work.<br /><em>Be clear about the trade-off.</em></p></section>
    </main><Footer />
  </>;
}

