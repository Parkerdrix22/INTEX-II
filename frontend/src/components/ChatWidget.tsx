import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { chatApi } from '../lib/api';
import { useAuth } from '../auth/useAuth';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
};

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Model often returns Markdown; the widget is plain text — normalize for display. */
function assistantPlainText(raw: string): string {
  return raw
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '');
}

/** Human-readable labels so chat doesn't show raw URL paths as link text. */
const CHAT_ROUTE_LABELS: Record<string, string> = {
  '/': 'Home',
  '/impact': 'Our Impact',
  '/safehouse-tour': 'Safehouse tour',
  '/login': 'Log in',
  '/signup': 'Sign up',
  '/profile': 'Profile',
  '/cookie-policy': 'Cookie policy',
  '/privacy-policy': 'Privacy policy',
  '/unauthorized': 'Unauthorized',
  '/donor-dashboard': 'Donor portal',
  '/my-impact': 'My Impact',
  '/donor-impact': 'Donor Impact',
  '/resident-dashboard': 'Resident dashboard',
  '/admin-dashboard': 'Admin dashboard',
  '/donors-contributions': 'Donors & contributions',
  '/caseload-inventory': 'Caseload inventory',
  '/reports-analytics': 'Reports & analytics',
  '/post-planner': 'Post planner',
  '/donor-churn': 'Donor retention',
  '/donor-archetypes': 'Donor archetypes',
  '/resident-risk-triage': 'Resident risk triage',
  '/case-resolution': 'Case resolution',
  '/process-recording': 'Process recording',
  '/home-visitation': 'Home visitation',
};

function labelForChatPath(path: string): string {
  const clean = path.split('?')[0]?.split('#')[0] ?? path;
  if (CHAT_ROUTE_LABELS[clean]) return CHAT_ROUTE_LABELS[clean];
  if (clean.startsWith('/donors-contributions/supporters/')) return 'Supporter donations';
  if (clean.startsWith('/caseload-inventory/') && clean !== '/caseload-inventory') return 'Resident case';
  const segments = clean.split('/').filter(Boolean);
  if (segments.length === 0) return 'Home';
  return segments
    .map((seg) =>
      seg
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' '),
    )
    .join(' · ');
}

/** Converts /route-style paths into in-app links with readable labels. */
function renderWithLinks(text: string): ReactNode[] {
  const parts = text.split(/(\/[\w-]+(?:\/[\w-]*)*)/g);
  return parts.map((part, i) =>
    /^\/([\w-]+(?:\/[\w-]*)*)$/.test(part) ? (
      <Link
        key={i}
        to={part}
        className="chat-widget__link"
        aria-label={`Go to ${labelForChatPath(part)}`}
      >
        {labelForChatPath(part)}
      </Link>
    ) : (
      part
    ),
  );
}

export function ChatWidget() {
  const { isAuthenticated } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  // Close chat when user signs out
  useEffect(() => {
    if (!isAuthenticated) setIsOpen(false);
  }, [isAuthenticated]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: makeId(),
      role: 'assistant',
      text: 'Hi! Ask me anything about using this website (pages, dashboards, and where to find things).',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  async function send() {
    const text = input.trim();
    if (!text || isSending) return;

    setError(null);
    setIsSending(true);
    setInput('');

    const userMessage: ChatMessage = { id: makeId(), role: 'user', text };
    setMessages((prev) => [...prev, userMessage]);

    try {
      const { answer } = await chatApi.ask(text);
      setMessages((prev) => [...prev, { id: makeId(), role: 'assistant', text: answer }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Request failed.';
      setError(message);
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: 'assistant',
          text: "Sorry — I couldn't answer that right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className="chat-widget"
      aria-live="polite"
    >
      {!isOpen && (
        <button
          type="button"
          className="chat-widget__fab"
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
          title="Ask about this website"
        >
          Chat
        </button>
      )}

      {isOpen && (
        <section className="chat-widget__panel" role="dialog" aria-label="Website help chat">
          <header className="chat-widget__header">
            <div className="chat-widget__title">
              <strong>Website Help</strong>
              <span className="chat-widget__subtitle">Ask about pages, dashboards, and access.</span>
            </div>
            <button
              type="button"
              className="chat-widget__close"
              onClick={() => setIsOpen(false)}
              aria-label="Close chat"
            >
              ×
            </button>
          </header>

          <div ref={scrollRef} className="chat-widget__messages" aria-label="Chat messages">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`chat-widget__bubble ${
                  m.role === 'user' ? 'chat-widget__bubble--user' : 'chat-widget__bubble--assistant'
                }`}
              >
                {renderWithLinks(m.role === 'assistant' ? assistantPlainText(m.text) : m.text)}
              </div>
            ))}
          </div>

          <form
            className="chat-widget__composer"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <label className="visually-hidden" htmlFor="chat-widget-input">
              Message
            </label>
            <textarea
              id="chat-widget-input"
              className="chat-widget__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                if (e.shiftKey) return;
                e.preventDefault();
                void send();
              }}
              placeholder="Type a question…"
              autoComplete="off"
              disabled={isSending}
            />
            <button type="submit" className="chat-widget__send" disabled={!canSend}>
              {isSending ? 'Sending…' : 'Send'}
            </button>
          </form>

          {error && <p className="chat-widget__error">{error}</p>}
        </section>
      )}
    </div>
  );
}
