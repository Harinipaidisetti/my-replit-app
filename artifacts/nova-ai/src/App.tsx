import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Link, Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import { useCreateChatCompletion } from '@workspace/api-client-react';
import {
  ArrowUp, Check, Code2, Copy, FileText, Lightbulb, Menu, MessageSquare,
  Moon, Plus, Settings2, Sparkles, Sun, Trash2, Zap,
} from 'lucide-react';

type MessageRole = 'user' | 'assistant';
type ChatMessage = { id: string; role: MessageRole; content: string; createdAt: string };
type Conversation = { id: string; title: string; createdAt: string; updatedAt: string; messages: ChatMessage[] };
type Preferences = { theme: 'light' | 'dark' | 'system'; enterToSend: boolean; showTimestamps: boolean };
const STORE_KEY = 'nova-ai.conversations.v1';
const PREF_KEY = 'nova-ai.preferences.v1';
const defaultPrefs: Preferences = { theme: 'system', enterToSend: true, showTimestamps: false };
const queryClient = new QueryClient();

function readStorage<T,>(key: string, fallback: T): T {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) as T : fallback;
  } catch {
    return fallback;
  }
}
function makeId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function makeConversation(): Conversation {
  const now = new Date().toISOString();
  return { id: makeId(), title: 'New conversation', createdAt: now, updatedAt: now, messages: [] };
}
function formatTime(date: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(date));
}
function toTitle(text: string) {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 42 ? `${clean.slice(0, 39)}…` : clean || 'New conversation';
}
function toApiMessages(messages: ChatMessage[]) {
  const recent = messages.slice(-40).reverse();
  const selected: ChatMessage[] = [];
  let characterCount = 0;
  for (const message of recent) {
    if (characterCount + message.content.length > 80_000) break;
    selected.push(message);
    characterCount += message.content.length;
  }
  return selected.reverse().map(({ role, content }) => ({ role, content }));
}
function errorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) return undefined;
  const e = error as { status?: number; response?: { status?: number }; cause?: { status?: number } };
  return e.status ?? e.response?.status ?? e.cause?.status;
}

function InlineMarkdown({ text }: { text: string }) {
  const safe = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const html = safe
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
function MarkdownContent({ content, onCopy }: { content: string; onCopy: (value: string) => void }) {
  const parts = content.split(/```([^\n`]*)\n([\s\S]*?)```/g);
  return <div className="message-content">
    {parts.map((part, index) => {
      if (index % 3 === 1) {
        const code = parts[index + 1] ?? '';
        const language = part.trim() || 'code';
        return <div className="code-block" key={`code-${index}`}>
          <div className="code-head"><span>{language}</span><button type="button" onClick={() => onCopy(code)} data-testid={`button-copy-code-${index}`}><Copy size={12} /> Copy code</button></div>
          <pre><code>{code}</code></pre>
        </div>;
      }
      if (index % 3 === 2) return null;
      const lines = part.split('\n');
      const blocks: Array<{ type: 'p' | 'ul' | 'ol' | 'h'; lines: string[]; level?: number }> = [];
      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const heading = trimmed.match(/^(#{1,3})\s+(.*)$/);
        const bullet = trimmed.match(/^[-*]\s+(.*)$/);
        const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
        const type = heading ? 'h' : bullet ? 'ul' : numbered ? 'ol' : 'p';
        const textValue = heading?.[2] ?? bullet?.[1] ?? numbered?.[1] ?? trimmed;
        const level = heading?.[1].length;
        const previous = blocks[blocks.length - 1];
        if (previous && previous.type === type && (type !== 'h' || previous.level === level)) previous.lines.push(textValue);
        else blocks.push({ type, lines: [textValue], level });
      });
      return <div key={`text-${index}`}>{blocks.map((block, blockIndex) => {
        if (block.type === 'ul' || block.type === 'ol') {
          const Tag = block.type;
          return <Tag key={blockIndex}>{block.lines.map((line, itemIndex) => <li key={itemIndex}><InlineMarkdown text={line} /></li>)}</Tag>;
        }
        if (block.type === 'h') {
          const Tag = (block.level === 1 ? 'h3' : block.level === 2 ? 'h4' : 'h5') as 'h3' | 'h4' | 'h5';
          return <Tag key={blockIndex}><InlineMarkdown text={block.lines[0]} /></Tag>;
        }
        return <p key={blockIndex}><InlineMarkdown text={block.lines.join(' ')} /></p>;
      })}</div>;
    })}
  </div>;
}

const promptIdeas = [
  { icon: Code2, title: 'Build something', text: 'Guide me through building a responsive navigation bar in HTML and CSS.', prompt: 'Guide me through building a responsive navigation bar in HTML and CSS. Explain the key decisions as we go.' },
  { icon: Lightbulb, title: 'Understand a concept', text: 'Explain JavaScript closures with a practical example.', prompt: 'Explain JavaScript closures with a practical example, then give me a small exercise to check my understanding.' },
  { icon: FileText, title: 'Review my code', text: 'Help me find what could be cleaner in a snippet I’m working on.', prompt: 'I want to get better at reviewing my own code. Give me a simple checklist for reviewing a small JavaScript function.' },
  { icon: Zap, title: 'Practice interview questions', text: 'Quiz me on the foundations of web development.', prompt: 'Quiz me on web development fundamentals, one question at a time. Wait for my answer before giving feedback.' },
];

function AppShell() {
  const [location] = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>(() => readStorage(STORE_KEY, []));
  const [activeId, setActiveId] = useState<string | null>(() => {
    const saved = readStorage<Conversation[]>(STORE_KEY, []);
    return [...saved].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]?.id ?? null;
  });
  const [preferences, setPreferences] = useState<Preferences>(() => ({ ...defaultPrefs, ...readStorage(PREF_KEY, defaultPrefs) }));
  const [draft, setDraft] = useState('');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [requestError, setRequestError] = useState<{ conversationId: string; status?: number; offline?: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const chatMutation = useCreateChatCompletion();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const activeConversation = conversations.find((conversation) => conversation.id === activeId) ?? null;
  const isChat = location === '/';
  const isSettings = location === '/settings';
  const effectiveDark = preferences.theme === 'dark' || (preferences.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => { localStorage.setItem(STORE_KEY, JSON.stringify(conversations)); }, [conversations]);
  useEffect(() => { localStorage.setItem(PREF_KEY, JSON.stringify(preferences)); }, [preferences]);
  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveDark);
  }, [effectiveDark]);
  useEffect(() => {
    if (preferences.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => document.documentElement.classList.toggle('dark', media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preferences.theme]);
  useEffect(() => {
    if (isChat) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [activeId, activeConversation?.messages.length, chatMutation.isPending, requestError, isChat]);
  useEffect(() => { setMobileOpen(false); }, [location]);

  const patchConversation = useCallback((id: string, update: (item: Conversation) => Conversation) => {
    setConversations((current) => current.map((item) => item.id === id ? update(item) : item));
  }, []);
  const startNewChat = useCallback(() => {
    setActiveId(null);
    setDraft('');
    setRequestError(null);
    setMobileOpen(false);
    window.setTimeout(() => textareaRef.current?.focus(), 30);
  }, []);
  const clearAllConversations = useCallback(() => {
    if (conversations.length === 0) return;
    if (!window.confirm('Delete all saved conversations from this browser? This cannot be undone.')) return;
    setConversations([]);
    setActiveId(null);
    setRequestError(null);
    setDraft('');
  }, [conversations.length]);

  const requestReply = useCallback(async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation) return;
    setRequestError(null);
    try {
      const messages = toApiMessages(conversation.messages);
      const result = await chatMutation.mutateAsync({ data: { messages } });
      const assistantMessage: ChatMessage = { id: makeId(), role: 'assistant', content: result.content, createdAt: new Date().toISOString() };
      patchConversation(conversationId, (item) => ({ ...item, updatedAt: assistantMessage.createdAt, messages: [...item.messages, assistantMessage] }));
    } catch (error) {
      setRequestError({ conversationId, status: errorStatus(error), offline: !navigator.onLine });
    }
  }, [chatMutation, conversations, patchConversation]);

  const sendMessage = useCallback(async (rawText: string) => {
    const text = rawText.trim();
    if (!text || chatMutation.isPending) return;
    let conversation = activeConversation;
    if (!conversation) {
      conversation = makeConversation();
      setConversations((current) => [conversation!, ...current]);
      setActiveId(conversation.id);
    }
    const userMessage: ChatMessage = { id: makeId(), role: 'user', content: text, createdAt: new Date().toISOString() };
    const conversationId = conversation.id;
    const currentMessages = conversation.messages;
    const nextMessages = [...currentMessages, userMessage];
    patchConversation(conversationId, (item) => ({
      ...item,
      title: item.messages.length ? item.title : toTitle(text),
      updatedAt: userMessage.createdAt,
      messages: [...item.messages, userMessage],
    }));
    setDraft('');
    setRequestError(null);
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    try {
      const result = await chatMutation.mutateAsync({ data: { messages: toApiMessages(nextMessages) } });
      const assistantMessage: ChatMessage = { id: makeId(), role: 'assistant', content: result.content, createdAt: new Date().toISOString() };
      patchConversation(conversationId, (item) => ({ ...item, updatedAt: assistantMessage.createdAt, messages: [...item.messages, assistantMessage] }));
    } catch (error) {
      setRequestError({ conversationId, status: errorStatus(error), offline: !navigator.onLine });
    }
  }, [activeConversation, chatMutation, patchConversation]);

  const deleteConversation = (conversation: Conversation) => {
    if (!window.confirm(`Delete “${conversation.title}”? This conversation will be removed from this browser.`)) return;
    setConversations((current) => current.filter((item) => item.id !== conversation.id));
    if (activeId === conversation.id) setActiveId(null);
    if (requestError?.conversationId === conversation.id) setRequestError(null);
  };
  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      setCopiedId(null);
    }
  };
  const chooseConversation = (id: string) => {
    setActiveId(id);
    setRequestError(null);
    setMobileOpen(false);
  };
  const sortedConversations = useMemo(() => [...conversations].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [conversations]);

  const sidebar = <aside className={`sidebar${mobileOpen ? ' open' : ''}`} aria-label="Conversation navigation">
    <div className="brand">
      <div className="brand-mark"><Sparkles size={17} strokeWidth={2.1} /></div>
      <div className="brand-name">nova<span>ai</span></div>
    </div>
    <button type="button" className="side-action primary-action" onClick={startNewChat} data-testid="button-new-chat"><Plus size={16} /> New chat</button>
    <div className="side-label">Your workspace</div>
    <Link href="/" className={`nav-link${isChat ? ' active' : ''}`} data-testid="link-chat"><MessageSquare size={15} /> Chat</Link>
    <Link href="/settings" className={`nav-link${isSettings ? ' active' : ''}`} data-testid="link-settings"><Settings2 size={15} /> Preferences</Link>
    <div className="side-label">Recent conversations</div>
    <div className="conversation-list" data-testid="list-conversations">
      {sortedConversations.length === 0 && <div style={{ padding: '8px 10px', color: 'hsl(var(--muted-foreground))', fontSize: 11, lineHeight: 1.6 }}>Your chats will live here, on this device.</div>}
      {sortedConversations.map((conversation) => <div className={`conversation-row${activeId === conversation.id ? ' selected' : ''}`} key={conversation.id}>
        <button type="button" className="conversation-title" onClick={() => chooseConversation(conversation.id)} title={conversation.title} data-testid={`button-select-conversation-${conversation.id}`}>{conversation.title}</button>
        <button type="button" className="icon-button conversation-delete" aria-label={`Delete ${conversation.title}`} onClick={() => deleteConversation(conversation)} data-testid={`button-delete-conversation-${conversation.id}`}><Trash2 size={14} /></button>
      </div>)}
    </div>
    <div className="sidebar-bottom">
      <Link href="/about" className="nav-link" data-testid="link-about"><FileText size={15} /> About NovaAI</Link>
      <div className="profile"><div className="profile-avatar">BT</div><div className="profile-copy">Study workspace<small>Personal · stored locally</small></div></div>
    </div>
  </aside>;

  return <div className="app-shell">
    {sidebar}
    {mobileOpen && <button className="mobile-scrim show" aria-label="Close navigation" onClick={() => setMobileOpen(false)} data-testid="button-close-navigation" />}
    <main className="workspace">
      <header className="topbar">
        <div className="topbar-left">
          <button type="button" className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileOpen(true)} data-testid="button-open-navigation"><Menu size={18} /></button>
          <span className="topbar-title">{isChat ? activeConversation?.title ?? 'Study chat' : isSettings ? 'Preferences' : 'About NovaAI'}</span>
          {isChat && <span className="context-pill"><span className="status-dot" /> Your learning space</span>}
        </div>
        <div className="topbar-actions">
          <Link href="/settings" className={`top-link${isSettings ? ' active' : ''}`} data-testid="link-top-settings">Settings</Link>
          <Link href="/settings" className="icon-button" aria-label={`Current theme: ${preferences.theme}. Open appearance settings`} data-testid="link-theme-settings">{effectiveDark ? <Moon size={16} /> : <Sun size={16} />}</Link>
        </div>
      </header>
      {isChat ? <div className="chat-viewport">
        <div className="chat-scroll" key={activeId ?? 'welcome'}>
          {!activeConversation || activeConversation.messages.length === 0 ? <section className="welcome">
            <div className="eyebrow"><Sparkles size={13} /> A little clarity, one concept at a time</div>
            <h1>Make room for <em>understanding.</em></h1>
            <p>Your study companion for learning web development. Bring a question, a half-finished idea, or a bug that has you stuck.</p>
            <div className="prompt-heading">A place to start</div>
            <div className="prompt-grid">
              {promptIdeas.map(({ icon: Icon, title, text, prompt }) => <button type="button" className="prompt-card" key={title} onClick={() => void sendMessage(prompt)} data-testid={`button-prompt-${title.toLowerCase().replaceAll(' ', '-')}`}>
                <strong><Icon size={15} />{title}</strong><span>{text}</span>
              </button>)}
            </div>
          </section> : <div className="message-stack" data-testid="list-messages">
            {activeConversation.messages.map((message) => <article className={`message ${message.role}`} key={message.id} data-testid={`message-${message.role}-${message.id}`}>
              <div className="message-avatar">{message.role === 'assistant' ? <Sparkles size={15} /> : <span>BT</span>}</div>
              <div className="message-body">
                <div className="message-meta">{message.role === 'assistant' ? 'NovaAI' : 'You'}{preferences.showTimestamps && <time className="message-time">{formatTime(message.createdAt)}</time>}</div>
                <MarkdownContent content={message.content} onCopy={(value) => void copyText(value, message.id)} />
                {message.role === 'assistant' && <div className="message-actions">
                  <button type="button" className="icon-button" aria-label={copiedId === message.id ? 'Copied' : 'Copy response'} onClick={() => void copyText(message.content, message.id)} data-testid={`button-copy-message-${message.id}`}>{copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}</button>
                </div>}
              </div>
            </article>)}
            {requestError?.conversationId === activeConversation.id && <div className="error-banner" role="alert" data-testid="status-chat-error">
              <strong>{requestError.status === 503 ? 'AI provider isn’t configured yet' : 'That reply didn’t come through'}</strong>
              {requestError.status === 503
                ? 'Your message is saved here. The AI provider key has not been configured on the server yet. You can retry after it is available.'
                : requestError.offline
                  ? "You're currently offline. Please check your internet connection."
                  : 'Your message is still here. Check your connection and try again.'}
              <br /><button type="button" onClick={() => void requestReply(activeConversation.id)} disabled={chatMutation.isPending} data-testid="button-retry-chat">Try again</button>
            </div>}
            {chatMutation.isPending && <div className="message" aria-label="NovaAI is thinking" data-testid="status-thinking">
              <div className="message-avatar"><Sparkles size={15} /></div><div className="message-body"><div className="message-meta">NovaAI</div><div className="typing"><span /><span /><span /></div></div>
            </div>}
            <div ref={endRef} />
          </div>}
        </div>
        <form className="composer-wrap" onSubmit={(event) => { event.preventDefault(); void sendMessage(draft); }}>
          <div className="composer">
          <textarea ref={textareaRef} value={draft} rows={1} maxLength={12000} aria-label="Message NovaAI" placeholder="Ask a question or share what you’re working on…" onChange={(event) => {
              setDraft(event.target.value);
              event.currentTarget.style.height = 'auto';
              event.currentTarget.style.height = `${Math.min(event.currentTarget.scrollHeight, 170)}px`;
            }} onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && preferences.enterToSend) {
                event.preventDefault();
                void sendMessage(draft);
              }
            }} data-testid="input-chat-message" />
            <div className="composer-foot"><span className="composer-hint">{preferences.enterToSend ? 'Enter to send · Shift + Enter for a new line' : 'Shift + Enter for a new line'}</span>
              <button className="send-button" type="submit" aria-label="Send message" disabled={!draft.trim() || chatMutation.isPending} data-testid="button-send-message">{chatMutation.isPending ? <span className="typing"><span /><span /><span /></span> : <ArrowUp size={17} />}</button>
            </div>
          </div>
          <div className="disclaimer">NovaAI can make mistakes. Use it to learn, then verify what matters.</div>
        </form>
      </div> : isSettings ? <SettingsPage preferences={preferences} setPreferences={setPreferences} onClearAll={clearAllConversations} canClearAll={conversations.length > 0} /> : location === '/about' ? <AboutPage /> : null}
    </main>
  </div>;
}

function SettingsPage({ preferences, setPreferences, onClearAll, canClearAll }: { preferences: Preferences; setPreferences: (value: Preferences) => void; onClearAll: () => void; canClearAll: boolean }) {
  const update = <K extends keyof Preferences>(key: K, value: Preferences[K]) => setPreferences({ ...preferences, [key]: value });
  return <div className="page-content">
    <div className="page-kicker">Make it yours</div><h1>Preferences</h1>
    <p className="page-lede">A few small choices to make your study space feel right.</p>
    <section className="settings-group" aria-labelledby="appearance-heading">
      <h2 id="appearance-heading">Appearance</h2>
      <div className="setting-row"><div className="setting-row-copy"><strong>Theme</strong><span>Choose the look that feels comfortable to study in.</span></div>
        <div className="segmented" role="group" aria-label="Theme">
          {(['light', 'dark', 'system'] as const).map((theme) => <button type="button" key={theme} aria-pressed={preferences.theme === theme} onClick={() => update('theme', theme)} data-testid={`button-theme-${theme}`}>
            {theme === 'light' ? <Sun size={12} /> : theme === 'dark' ? <Moon size={12} /> : <Settings2 size={12} />}{theme[0].toUpperCase() + theme.slice(1)}
          </button>)}
        </div>
      </div>
    </section>
    <section className="settings-group" aria-labelledby="chat-heading">
      <h2 id="chat-heading">Chat preferences</h2>
      <div className="setting-row"><div className="setting-row-copy"><strong>Enter to send</strong><span>Press Enter to send. Use Shift + Enter to add a new line.</span></div><button type="button" className="switch" role="switch" aria-checked={preferences.enterToSend} aria-label="Enter to send" onClick={() => update('enterToSend', !preferences.enterToSend)} data-testid="switch-enter-to-send"><span /></button></div>
      <div className="setting-row"><div className="setting-row-copy"><strong>Show timestamps</strong><span>Display the time beside each message.</span></div><button type="button" className="switch" role="switch" aria-checked={preferences.showTimestamps} aria-label="Show timestamps" onClick={() => update('showTimestamps', !preferences.showTimestamps)} data-testid="switch-show-timestamps"><span /></button></div>
    </section>
    <section className="settings-group" aria-labelledby="general-heading">
      <h2 id="general-heading">General</h2>
      <div className="setting-row"><div className="setting-row-copy"><strong>Clear all conversations</strong><span>Remove every saved chat from this browser.</span></div><button type="button" className="clear-chats-button" onClick={onClearAll} disabled={!canClearAll} data-testid="button-clear-all-conversations">Clear chats</button></div>
    </section>
    <p className="disclaimer" style={{ textAlign: 'left', marginTop: 24 }}>Preferences are saved only in this browser.</p>
  </div>;
}

function AboutPage() {
  return <div className="page-content">
    <div className="page-kicker">A companion for the curious</div><h1>About NovaAI</h1>
    <p className="page-lede">A personal AI chat workspace for learning web development—designed to help you think through the code, not just get past it.</p>
    <section className="about-card">
      <div className="about-mark"><Sparkles size={22} /></div>
      <h2>Built for the learning process</h2>
      <p>NovaAI is a focused study companion for a BTech student growing their web development skills. Ask questions, work through examples, and use the conversation to build a stronger mental model.</p>
      <div className="about-details">
        <div className="about-detail"><span>Conversations</span><strong>Saved in this browser</strong></div>
        <div className="about-detail"><span>AI responses</span><strong>Provided by your configured model</strong></div>
      </div>
    </section>
    <p className="disclaimer" style={{ textAlign: 'left', marginTop: 20 }}>NovaAI is a learning aid. AI responses can be incorrect; check important details against trusted documentation.</p>
  </div>;
}

function Router() {
  return <Switch>
    <Route path="/" component={AppShell} />
    <Route path="/settings" component={AppShell} />
    <Route path="/about" component={AppShell} />
    <Route component={NotFound} />
  </Switch>;
}
function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}
function App() {
  return <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <RoutedErrorBoundary><Router /></RoutedErrorBoundary>
      </WouterRouter>
      <Toaster />
    </TooltipProvider>
  </QueryClientProvider>;
}

export default App;