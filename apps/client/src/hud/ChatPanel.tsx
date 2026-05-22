import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ChatLine, ChatScopeView } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';

type ChatPanelProps = {
  lines: ChatLine[];
  myPlayerId: string | null;
  onSendChat: (text: string, scope: ChatScopeView) => void;
  /**
   * §52 polish — server-side rejection reason for the last
   * ChatRequest. Renders under the input form when set. Cleared
   * automatically by the reducer when the next successful broadcast
   * for this player lands.
   */
  lastError?: { reason: string; at: number } | null;
};

const TABS: { id: ChatScopeView; label: string }[] = [
  { id: 'near', label: 'Near' },
  { id: 'all', label: 'All' },
];

export function ChatPanel({ lines, myPlayerId, onSendChat, lastError }: ChatPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('chat');
  const [activeTab, setActiveTab] = useState<ChatScopeView>('near');
  const [draft, setDraft] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);

  const visible = useMemo(() => lines.filter((line) => line.scope === activeTab).slice(-50), [lines, activeTab]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [visible.length]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    onSendChat(text, activeTab);
    setDraft('');
  };

  return (
    <section ref={panelRef} className="chat-panel" aria-label="Chat">
      <div className="panel-title">
        <strong>Chat</strong>
        <span>{activeTab === 'near' ? '~150 m' : 'world'}</span>
      </div>
      <div className="chat-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`chat-tab${activeTab === tab.id ? ' chat-tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div ref={listRef} className="chat-list">
        {visible.length === 0 ? (
          <p className="chat-empty">No messages yet. Say hi.</p>
        ) : (
          visible.map((line) => (
            <div
              key={line.id}
              className={`chat-line${line.fromId === myPlayerId ? ' chat-line--self' : ''}`}
            >
              <strong>{line.fromName}</strong>
              <span>{line.text}</span>
            </div>
          ))
        )}
      </div>
      <form className="chat-form" onSubmit={submit}>
        <input
          type="text"
          value={draft}
          maxLength={240}
          placeholder={activeTab === 'near' ? 'Say to nearby…' : 'Shout to the world…'}
          onChange={(event) => setDraft(event.target.value)}
          aria-label="Chat message"
        />
        <button type="submit" disabled={!draft.trim()}>Send</button>
      </form>
      {lastError && (
        <small className="chat-error" role="status">{chatErrorCopy(lastError.reason)}</small>
      )}
    </section>
  );
}

function chatErrorCopy(reason: string): string {
  switch (reason) {
    case 'rateLimited': return 'Slow down — too many messages.';
    case 'emptyText': return 'Type something first.';
    case 'playerNotFound': return 'Reconnect — your session was lost.';
    default: return `Chat failed: ${reason}`;
  }
}
