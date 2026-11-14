'use client';

import { useEffect, useRef, useState } from 'react';

/** Copy only the requested capability; the fallback stays within the private UI. */
export function CopyLinkButton({ path, kind }: { path: string; kind: 'client' | 'private' }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [fallback, setFallback] = useState('');
  const copySequence = useRef(0);
  const fallbackInput = useRef<HTMLInputElement>(null);
  const label = kind === 'client' ? 'Client' : 'Private';

  useEffect(() => {
    copySequence.current += 1;
    setBusy(false); setStatus(''); setFallback('');
    return () => { copySequence.current += 1; };
  }, [path, kind]);
  useEffect(() => {
    if (fallback) { fallbackInput.current?.focus(); fallbackInput.current?.select(); }
  }, [fallback]);

  async function copyLink() {
    if (busy) return;
    const attempt = ++copySequence.current;
    setBusy(true); setStatus(''); setFallback('');
    let url: URL;
    try {
      url = new URL(path, window.location.origin);
      const expectedPath = kind === 'client' ? /^\/offer\/?$/ : /^\/status\/?$/;
      if (url.origin !== window.location.origin || !expectedPath.test(url.pathname) || !/^[a-f0-9]{64}$/.test(url.searchParams.get('token') || '')) {
        throw new Error('Invalid proposal link');
      }
    } catch {
      setStatus('This link is unavailable. Reload the saved proposal and try again.');
      setBusy(false); return;
    }
    try {
      // Do not await a network request before copying: retain the browser's user gesture.
      await navigator.clipboard.writeText(url.href);
      if (copySequence.current === attempt) setStatus(`${label} link copied.${kind === 'private' ? ' Save it somewhere private.' : ''}`);
    } catch {
      if (copySequence.current === attempt) {
        setFallback(url.href);
        setStatus(`Automatic copying is unavailable. Select and copy the ${kind} link below.`);
      }
    } finally {
      if (copySequence.current === attempt) setBusy(false);
    }
  }

  return <div className="copy-link-control">
    <button className="button button-outline copy-link-button" type="button" onClick={copyLink} disabled={busy || !path}>{busy ? 'Copying link…' : `Copy ${kind} link`}</button>
    <p className="copy-link-status" role="status">{status}</p>
    {fallback && <input className="copy-link-fallback" ref={fallbackInput} aria-label={`${label} link to copy`} readOnly value={fallback} onFocus={event => event.target.select()} />}
  </div>;
}
