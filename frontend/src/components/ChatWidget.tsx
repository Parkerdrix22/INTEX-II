import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/** Converts /route-style paths in text into clickable <a> links. */
function renderWithLinks(text: string): React.ReactNode[] {
  const parts = text.split(/(\/[\w-]+(?:\/[\w-]*)*)/g);
  return parts.map((part, i) =>
    /^\/([\w-]+(?:\/[\w-]*)*)$/.test(part) ? (
      <a key={i} href={part} className="chat-widget__link">
        {part}
      </a>
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
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const positionRef = useRef(position);
  positionRef.current = position;

  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: makeId(),
      role: 'assistant',
      text: 'Hi! Ask me anything about using this website (pages, dashboards, and where to find things).',
    },
  ]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canSend = useMemo(() => input.trim().length > 0 && !isSending, [input, isSending]);

  // Initialize FAB to bottom-right corner (bottom: 1.1rem, right: 1.1rem)
  const fabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const REM = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const margin = Math.round(1.1 * REM);
    // Measure actual FAB size after render, fall back to estimates
    const fabW = fabRef.current?.offsetWidth  ?? 68;
    const fabH = fabRef.current?.offsetHeight ?? 40;
    setPosition({
      x: window.innerWidth  - fabW - margin,
      y: window.innerHeight - fabH - Math.round(12 * REM),
    });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    // Clamp position so the panel doesn't open outside the viewport
    setPosition((prev) => ({
      x: Math.min(Math.max(0, prev.x), window.innerWidth  - 380),
      y: Math.min(Math.max(0, prev.y), window.innerHeight - 520),
    }));
  }, [isOpen, messages.length]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  /**
   * Attach drag listeners on mousedown.
   * Movement threshold of 4px distinguishes a drag from a click.
   */
  function startDrag(e: React.MouseEvent<HTMLElement>) {
    // Don't start drag on the close button
    if ((e.target as HTMLElement).closest('.chat-widget__close')) return;

    const startMouseX = e.clientX;
    const startMouseY = e.clientY;
    const startPosX = positionRef.current.x;
    const startPosY = positionRef.current.y;
    let dragging = false;

    function onMouseMove(ev: MouseEvent) {
      const dx = ev.clientX - startMouseX;
      const dy = ev.clientY - startMouseY;
      if (!dragging && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      dragging = true;
      ev.preventDefault();
      const panelW = isOpen ? 380 : 80;
      const panelH = isOpen ? 520 : 48;
      setPosition({
        x: Math.min(Math.max(0, startPosX + dx), window.innerWidth  - panelW),
        y: Math.min(Math.max(0, startPosY + dy), window.innerHeight - panelH),
      });
    }

    function onMouseUp() {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

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
      style={{ left: position.x, top: position.y }}
      aria-live="polite"
    >
      {!isOpen && (
        <button
          ref={fabRef}
          type="button"
          className="chat-widget__fab"
          onMouseDown={startDrag}
          onClick={() => setIsOpen(true)}
          aria-label="Open chat"
          title="Ask about this website"
        >
          Chat
        </button>
      )}

      {isOpen && (
        <section className="chat-widget__panel" role="dialog" aria-label="Website help chat">
          <header className="chat-widget__header" onMouseDown={startDrag}>
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
                {renderWithLinks(m.text)}
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
