import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import type { ChatLine, ChatScopeView, CombatLine, CombatLineTone } from '../gameTypes';
import { useDraggablePanel } from './useDraggablePanel';

type ChatPanelProps = {
  lines: ChatLine[];
  systemLines: readonly CombatLine[];
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

type ChatTabId = 'system' | ChatScopeView;

type ChatTab = {
  id: ChatTabId;
  label: string;
  hint: string;
};

const TABS: ChatTab[] = [
  { id: 'system', label: 'System', hint: 'events' },
  { id: 'all', label: 'World', hint: 'world' },
  { id: 'near', label: 'Near', hint: '~150 m' },
];

export function ChatPanel({ lines, systemLines, myPlayerId, onSendChat, lastError }: ChatPanelProps) {
  const panelRef = useDraggablePanel<HTMLElement>('chat');
  const [activeTab, setActiveTab] = useState<ChatTabId>('system');
  const [detached, setDetached] = useState<Record<ChatTabId, boolean>>({
    system: false,
    all: false,
    near: false,
  });
  const drafts = useChatDrafts(onSendChat);
  const stackedTabs = TABS.filter((tab) => !detached[tab.id]);
  const activeStackedTab = resolveActiveTab(stackedTabs, activeTab);
  const activeMeta = TABS.find((tab) => tab.id === activeStackedTab) ?? TABS[0];
  const detachTab = (tabId: ChatTabId) => setDetached((prev) => ({ ...prev, [tabId]: true }));
  const attachTab = (tabId: ChatTabId) => {
    setDetached((prev) => ({ ...prev, [tabId]: false }));
    setActiveTab(tabId);
  };

  return (
    <>
      {stackedTabs.length > 0 && (
        <section ref={panelRef} className="chat-panel" aria-label="Chat">
          <div className="panel-title chat-titlebar">
            <strong>Chat</strong>
            <span>{activeMeta.hint}</span>
          </div>
          <ChatTabs
            tabs={stackedTabs}
            activeTab={activeStackedTab}
            onSelect={setActiveTab}
            onDetach={detachTab}
          />
          <ChatPane
            tabId={activeStackedTab}
            lines={lines}
            systemLines={systemLines}
            myPlayerId={myPlayerId}
            drafts={drafts}
            lastError={lastError}
          />
        </section>
      )}
      {TABS.filter((tab) => detached[tab.id]).map((tab) => (
        <DetachedChatWindow
          key={tab.id}
          tab={tab}
          lines={lines}
          systemLines={systemLines}
          myPlayerId={myPlayerId}
          drafts={drafts}
          lastError={lastError}
          onAttach={attachTab}
        />
      ))}
    </>
  );
}

type DraftControls = {
  values: Record<ChatScopeView, string>;
  setValue: (scope: ChatScopeView, value: string) => void;
  submit: (scope: ChatScopeView) => void;
};

function useChatDrafts(onSendChat: (text: string, scope: ChatScopeView) => void): DraftControls {
  const [values, setValues] = useState<Record<ChatScopeView, string>>({ near: '', all: '' });
  return {
    values,
    setValue: (scope, value) => setValues((prev) => ({ ...prev, [scope]: value })),
    submit: (scope) => {
      const text = values[scope].trim();
      if (!text) return;
      onSendChat(text, scope);
      setValues((prev) => ({ ...prev, [scope]: '' }));
    },
  };
}

function resolveActiveTab(tabs: ChatTab[], activeTab: ChatTabId): ChatTabId {
  return tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id ?? 'system';
}

function ChatTabs({
  tabs,
  activeTab,
  onSelect,
  onDetach,
}: {
  tabs: ChatTab[];
  activeTab: ChatTabId;
  onSelect: (tabId: ChatTabId) => void;
  onDetach: (tabId: ChatTabId) => void;
}) {
  return (
    <div className="chat-tabs" role="tablist">
      {tabs.map((tab) => (
        <div key={tab.id} className={`chat-tab-control${activeTab === tab.id ? ' chat-tab-control--active' : ''}`}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className="chat-tab"
            onClick={() => onSelect(tab.id)}
          >
            {tab.label}
          </button>
          <button
            type="button"
            className="chat-tab-detach"
            title={`Detach ${tab.label}`}
            aria-label={`Detach ${tab.label}`}
            onClick={() => onDetach(tab.id)}
          >
            ↗
          </button>
        </div>
      ))}
    </div>
  );
}

function DetachedChatWindow({
  tab,
  lines,
  systemLines,
  myPlayerId,
  drafts,
  lastError,
  onAttach,
}: {
  tab: ChatTab;
  lines: ChatLine[];
  systemLines: readonly CombatLine[];
  myPlayerId: string | null;
  drafts: DraftControls;
  lastError?: { reason: string; at: number } | null;
  onAttach: (tabId: ChatTabId) => void;
}) {
  const panelRef = useDraggablePanel<HTMLElement>(`chat-${tab.id}`);
  return (
    <section
      ref={panelRef}
      className={`chat-panel chat-panel--detached chat-panel--${tab.id}`}
      aria-label={`${tab.label} chat`}
    >
      <div className="panel-title chat-titlebar">
        <strong>{tab.label}</strong>
        <button
          type="button"
          className="panel-close"
          aria-label={`Stack ${tab.label} as tab`}
          title="Stack as tab"
          onClick={() => onAttach(tab.id)}
        >
          ×
        </button>
      </div>
      <ChatPane
        tabId={tab.id}
        lines={lines}
        systemLines={systemLines}
        myPlayerId={myPlayerId}
        drafts={drafts}
        lastError={lastError}
      />
    </section>
  );
}

function ChatPane({
  tabId,
  lines,
  systemLines,
  myPlayerId,
  drafts,
  lastError,
}: {
  tabId: ChatTabId;
  lines: ChatLine[];
  systemLines: readonly CombatLine[];
  myPlayerId: string | null;
  drafts: DraftControls;
  lastError?: { reason: string; at: number } | null;
}) {
  if (tabId === 'system') {
    return <SystemLogList lines={systemLines} />;
  }
  return (
    <div className="chat-pane">
      <ChatMessageList lines={lines} scope={tabId} myPlayerId={myPlayerId} />
      <ChatComposer scope={tabId} draft={drafts.values[tabId]} onDraft={drafts.setValue} onSend={drafts.submit} />
      {lastError && (
        <small className="chat-error" role="status">{chatErrorCopy(lastError.reason)}</small>
      )}
    </div>
  );
}

function ChatMessageList({
  lines,
  scope,
  myPlayerId,
}: {
  lines: ChatLine[];
  scope: ChatScopeView;
  myPlayerId: string | null;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const visible = useMemo(() => lines.filter((line) => line.scope === scope).slice(-50), [lines, scope]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [visible.length]);
  return (
    <div ref={listRef} className="chat-list">
      {visible.length === 0 ? (
        <p className="chat-empty">No messages yet. Say hi.</p>
      ) : visible.map((line) => (
        <div key={line.id} className={`chat-line${line.fromId === myPlayerId ? ' chat-line--self' : ''}`}>
          <strong>{line.fromName}</strong>
          <span>{line.text}</span>
        </div>
      ))}
    </div>
  );
}

/** Tiny leading glyph per tone — a visual anchor so the eye can skim
 *  the log by category before reading any words. */
const TONE_ICON: Record<CombatLineTone, string> = {
  offense: '⚔',
  crit: '✦',
  incoming: '🛡',
  miss: '↯',
  heal: '✚',
  buff: '⤴',
  kill: '☠',
  loot: '◆',
  fail: '⃠',
};

function SystemLogList({ lines }: { lines: readonly CombatLine[] }) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const ordered = useMemo(() => [...lines].reverse(), [lines]);
  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [ordered.length]);
  return (
    <div className="chat-pane chat-pane--system">
      <div ref={listRef} className="chat-list chat-list--system">
        {ordered.length === 0 ? (
          <p className="chat-empty">No system messages yet.</p>
        ) : ordered.map((line) => (
          <span key={line.id} className={`chat-system-line${line.tone ? ` chat-system-line--${line.tone}` : ''}`}>
            <span className="chat-system-time">{formatLineTime(line.id)}</span>
            {line.tone && <span className="chat-system-icon" aria-hidden="true">{TONE_ICON[line.tone]}</span>}
            {line.text}
            {line.count && line.count > 1 ? ` (×${line.count})` : ''}
          </span>
        ))}
      </div>
    </div>
  );
}

function ChatComposer({
  scope,
  draft,
  onDraft,
  onSend,
}: {
  scope: ChatScopeView;
  draft: string;
  onDraft: (scope: ChatScopeView, value: string) => void;
  onSend: (scope: ChatScopeView) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSend(scope);
  };
  return (
    <form className="chat-form" onSubmit={submit}>
      <input
        type="text"
        value={draft}
        maxLength={240}
        placeholder={scope === 'near' ? 'Say to nearby…' : 'Shout to the world…'}
        onChange={(event) => onDraft(scope, event.target.value)}
        aria-label="Chat message"
      />
      <button type="submit" disabled={!draft.trim()}>Send</button>
    </form>
  );
}

function formatLineTime(id: string): string {
  const ms = parseLineTime(id);
  if (!Number.isFinite(ms)) return '--:--';
  const d = new Date(ms);
  const hh = d.getHours().toString().padStart(2, '0');
  const mm = d.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

function parseLineTime(id: string): number {
  const parts = id.split(':');
  if (parts.length >= 3) return Number(parts[parts.length - 2]);
  const dashIndex = id.lastIndexOf('-');
  return dashIndex >= 0 ? Number(id.slice(dashIndex + 1)) : Number.NaN;
}

function chatErrorCopy(reason: string): string {
  switch (reason) {
    case 'rateLimited': return 'Slow down — too many messages.';
    case 'emptyText': return 'Type something first.';
    case 'playerNotFound': return 'Reconnect — your session was lost.';
    default: return `Chat failed: ${reason}`;
  }
}
