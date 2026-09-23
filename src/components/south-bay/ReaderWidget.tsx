import { useState, useRef, useEffect } from 'react';

type TipType = 'event' | 'tip' | 'correction' | 'feedback';
type Status = 'idle' | 'open' | 'sending' | 'sent' | 'error';

const TYPE_OPTIONS: { value: TipType; label: string; emoji: string; placeholder: string }[] = [
  { value: 'event',      label: 'Event',      emoji: '📅', placeholder: "What's happening, when, and where?" },
  { value: 'tip',        label: 'News Tip',   emoji: '📰', placeholder: "What's the story? Include any details you have." },
  { value: 'correction', label: 'Correction', emoji: '⚠️', placeholder: "What's wrong, and what should it say?" },
  { value: 'feedback',   label: 'Feedback',   emoji: '💬', placeholder: "What's on your mind?" },
];

export default function ReaderWidget() {
  const [status, setStatus] = useState<Status>('idle');
  const [type, setType] = useState<TipType>('feedback');
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  // Set when the panel closes from the keyboard, the close button, or a
  // finished send, so focus lands back on the button instead of <body>. An
  // outside click leaves focus wherever the reader clicked.
  const restoreFocusRef = useRef(false);

  useEffect(() => {
    if (status === 'open') textareaRef.current?.focus();
    if (status === 'idle' && restoreFocusRef.current) {
      restoreFocusRef.current = false;
      fabRef.current?.focus();
    }
  }, [status]);

  const close = () => {
    restoreFocusRef.current = true;
    setStatus('idle');
  };

  useEffect(() => {
    if (status !== 'open') return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setStatus('idle');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [status]);

  useEffect(() => {
    if (status !== 'open') return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [status]);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/reader-tip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          message: message.trim(),
          page: window.location.href,
          email: email.trim() || undefined,
        }),
      });
      if (res.ok) {
        setStatus('sent');
        setMessage('');
        setEmail('');
        setTimeout(close, 2500);
      } else {
        setStatus('error');
        setTimeout(() => setStatus('open'), 2500);
      }
    } catch {
      setStatus('error');
      setTimeout(() => setStatus('open'), 2500);
    }
  };

  const currentType = TYPE_OPTIONS.find(o => o.value === type)!;
  const canSend = message.trim().length > 0 && status !== 'sending';

  // Styles live in chrome.css (.rw-*). The fixed FAB sits above the safe-area
  // inset (iOS home-indicator strip) and rests at reduced opacity so it doesn't
  // permanently occlude trailing page content; .sb-main gets matching bottom
  // padding on phones.
  if (status === 'idle') {
    return (
      <button ref={fabRef} type="button" className="rw-fab" onClick={() => setStatus('open')} aria-label="Submit a tip or feedback">
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 2c-2.236 0-4.43.18-6.57.524C1.993 2.755 1 4.014 1 5.426v5.148c0 1.413.993 2.67 2.43 2.902 1.168.188 2.352.327 3.55.414.28.02.521.18.642.413l1.713 3.293a.75.75 0 0 0 1.33 0l1.713-3.293c.121-.233.362-.393.642-.413 1.198-.087 2.382-.226 3.55-.414 1.437-.231 2.43-1.49 2.43-2.902V5.426c0-1.413-.993-2.67-2.43-2.902A41.803 41.803 0 0 0 10 2Z" clipRule="evenodd" />
        </svg>
        <span className="rw-fab-label">Tips &amp; Feedback</span>
      </button>
    );
  }

  if (status === 'sent') {
    return (
      <div className="rw-panel rw-panel--note" role="status">
        <div className="rw-note-icon" aria-hidden="true">📬</div>
        <p className="rw-note-title">Got it, thanks!</p>
        <p className="rw-note-sub">We read every message.</p>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="rw-panel rw-panel--note" role="alert">
        <p className="rw-note-error">Couldn't send. Try again?</p>
      </div>
    );
  }

  return (
    <div ref={panelRef} className="rw-panel" role="dialog" aria-label="Tips and feedback">
      <div className="rw-head">
        <span className="rw-title">Tips &amp; Feedback</span>
        <button type="button" className="rw-close" onClick={close} aria-label="Close">
          <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
          </svg>
        </button>
      </div>

      <div className="rw-body">
        <div className="rw-types" role="group" aria-label="What kind of message?">
          {TYPE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              className="rw-type"
              aria-pressed={type === opt.value}
              onClick={() => setType(opt.value)}
            >
              <span aria-hidden="true">{opt.emoji}</span> {opt.label}
            </button>
          ))}
        </div>

        <textarea
          ref={textareaRef}
          className="rw-field"
          value={message}
          onChange={e => setMessage(e.target.value)}
          placeholder={currentType.placeholder}
          aria-label="Your message"
          rows={4}
          maxLength={2000}
        />

        <input
          type="email"
          className="rw-field"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email (optional, if you'd like a reply)"
          aria-label="Email (optional)"
          autoComplete="email"
          maxLength={254}
        />

        <button type="button" className="sb-btn sb-btn--primary rw-send" onClick={handleSubmit} disabled={!canSend}>
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>

        <p className="rw-foot">Anonymous. No account needed.</p>
      </div>
    </div>
  );
}
