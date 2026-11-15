'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { buildClientMessage } from '@/lib/message';
import type { PublicProposal } from '@/lib/types';

type Props = {
  proposal: PublicProposal;
  clientPath: string;
  onProposalChange?: (proposal: PublicProposal) => void;
};

/** A new link gets a fresh panel, including any pending requests or clipboard state. */
export function ClientMessagePanel(props: Props) {
  return <MessagePanelState key={props.clientPath} {...props} />;
}

function MessagePanelState({ proposal, clientPath, onProposalChange }: Props) {
  const [snapshot, setSnapshot] = useState(proposal);
  const [clientUrl, setClientUrl] = useState('');
  const [open, setOpen] = useState(false);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [fallback, setFallback] = useState(false);
  const current = useRef(proposal);
  const callback = useRef(onProposalChange);
  const mounted = useRef(false);
  const abort = useRef<AbortController | null>(null);
  const inFlight = useRef<Promise<PublicProposal | null> | null>(null);
  const copyingRef = useRef(false);

  useEffect(() => { callback.current = onProposalChange; }, [onProposalChange]);
  useEffect(() => {
    mounted.current = true;
    const url = new URL(clientPath, window.location.origin);
    if (url.origin === window.location.origin && url.pathname === '/offer/' && /^[a-f0-9]{64}$/.test(url.searchParams.get('token') || '')) {
      setClientUrl(url.href);
    } else setError('The client link is invalid. Open the saved proposal again.');
    return () => { mounted.current = false; abort.current?.abort(); };
  }, [clientPath]);
  useEffect(() => {
    // A delayed pending response must never replace a confirmation already observed.
    if (current.current.confirmation && !proposal.confirmation) return;
    if (!current.current.confirmation && proposal.confirmation) { setStatus(''); setFallback(false); }
    current.current = proposal;
    setSnapshot(proposal);
  }, [proposal]);

  const refresh = useCallback((): Promise<PublicProposal | null> => {
    if (inFlight.current) return inFlight.current;
    if (!clientUrl) return Promise.resolve(null);
    const controller = new AbortController();
    abort.current = controller;
    setChecking(true);
    const request = (async () => {
      try {
        const token = new URL(clientUrl).searchParams.get('token');
        const response = await fetch(`/api/client/${token}`, { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Could not check the latest message. Please try again.');
        const received = await response.json() as PublicProposal;
        if (!mounted.current || controller.signal.aborted) return null;
        const next = current.current.confirmation ? current.current : received;
        // Validate the message before exposing it; invalid saved choices fail closed.
        buildClientMessage(next, clientUrl);
        if (!current.current.confirmation && next.confirmation) { setStatus(''); setFallback(false); }
        current.current = next;
        setSnapshot(next); setReady(true); setError('');
        callback.current?.(next);
        return next;
      } catch (cause) {
        if (mounted.current && !controller.signal.aborted) {
          setError(cause instanceof TypeError ? 'Connection interrupted. Your published proposal is still saved. Try again to load the latest message.' : cause instanceof Error ? cause.message : 'Could not check the latest message. Please try again.');
          setReady(false); setFallback(false);
        }
        return null;
      } finally {
        if (mounted.current && !controller.signal.aborted) setChecking(false);
      }
    })();
    inFlight.current = request;
    void request.finally(() => { if (inFlight.current === request) inFlight.current = null; });
    return request;
  }, [clientUrl]);

  useEffect(() => {
    if (!open || !clientUrl) return;
    void refresh();
    const updateVisible = () => { if (!document.hidden) void refresh(); };
    const timer = setInterval(() => { if (!document.hidden && !current.current.confirmation) void refresh(); }, 5000);
    window.addEventListener('focus', updateVisible);
    document.addEventListener('visibilitychange', updateVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', updateVisible);
      document.removeEventListener('visibilitychange', updateVisible);
    };
  }, [open, clientUrl, refresh]);

  async function copyMessage() {
    if (copyingRef.current) return;
    copyingRef.current = true;
    setCopying(true); setStatus(''); setFallback(false);
    try {
      const latest = await refresh();
      if (!latest || !mounted.current) return;
      // Use the same snapshot and generator as the preview, never editor inputs.
      const message = buildClientMessage(current.current, clientUrl);
      try {
        await navigator.clipboard.writeText(message);
        // If confirmation arrives while the clipboard write is pending, finish
        // with the now-agreed scope rather than reporting an outdated copy.
        if (mounted.current) {
          const newestMessage = buildClientMessage(current.current, clientUrl);
          if (newestMessage !== message) await navigator.clipboard.writeText(newestMessage);
        }
        if (mounted.current) setStatus('Message copied. Ready to send.');
      } catch {
        if (mounted.current) { setFallback(true); setStatus('Select and copy the message below.'); }
      }
    } finally {
      copyingRef.current = false;
      if (mounted.current) setCopying(false);
    }
  }

  const message = clientUrl ? buildClientMessage(snapshot, clientUrl) : '';
  return <div className="message-panel">
    <details className="message-preview" onToggle={event => {
      const expanded = event.currentTarget.open;
      if (expanded) setReady(false);
      setOpen(expanded);
    }}>
      <summary>Preview message to client</summary>
      {open && <div className="message-preview-body">
        <p>{snapshot.confirmation ? 'Only the agreed option is included.' : 'This message uses your published proposal. Unpublished edits are not included.'}</p>
        {!error && !ready && <p role="status">Checking the latest message…</p>}
        {!error && ready && <pre className="message-text" aria-label="Client message preview" tabIndex={0}>{message}</pre>}
      </div>}
    </details>
    {error && <div className="message-error" role="alert"><p>{error}</p><button className="text-button" type="button" disabled={checking} onClick={() => void refresh()}>Try again</button></div>}
    <button className="button button-primary" type="button" disabled={copying || !clientUrl} onClick={copyMessage}>{copying ? 'Preparing message…' : 'Copy message to client'}</button>
    <p className="copy-status" role="status">{status}</p>
    {fallback && ready && !error && <textarea className="message-fallback" aria-label="Client message to copy" value={message} readOnly onFocus={event => event.target.select()} />}
  </div>;
}
