import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Hash, Plus, Compass, MessageCircle, Settings, Search, Send, Users,
  ChevronDown, Headphones, Mic, Bell, LogOut, X, LoaderCircle, ShieldCheck,
  Sparkles, Menu
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type Profile = { id: string; username: string; display_name: string | null; avatar_url?: string | null };
type Space = { id: string; name: string; owner_id?: string; created_at?: string };
type Channel = { id: string; server_id: string; name: string; type?: string };
type Message = { id: string; channel_id: string; user_id: string; content: string; created_at: string; profile?: Profile };

const demoSpaces: Space[] = [
  { id: "demo-lobby", name: "Ночная смена" },
  { id: "demo-gamedev", name: "Pixel Lab" },
  { id: "demo-study", name: "Космическая кухня" }
];
const demoChannels: Record<string, Channel[]> = {
  "demo-lobby": [
    { id: "demo-general", server_id: "demo-lobby", name: "общий" },
    { id: "demo-memes", server_id: "demo-lobby", name: "мемы" },
    { id: "demo-ideas", server_id: "demo-lobby", name: "идеи" }
  ],
  "demo-gamedev": [
    { id: "demo-dev-chat", server_id: "demo-gamedev", name: "dev-chat" },
    { id: "demo-art", server_id: "demo-gamedev", name: "арт" }
  ],
  "demo-study": [
    { id: "demo-coffee", server_id: "demo-study", name: "кофейня" },
    { id: "demo-focus", server_id: "demo-study", name: "фокус-комната" }
  ]
};
const demoMessages: Record<string, Message[]> = {
  "demo-general": [
    { id: "m1", channel_id: "demo-general", user_id: "bot-1", content: "Добро пожаловать в Nox 👋", created_at: new Date(Date.now() - 1000 * 60 * 18).toISOString(), profile: { id: "bot-1", username: "nox", display_name: "Nox" } },
    { id: "m2", channel_id: "demo-general", user_id: "bot-2", content: "Это демо-интерфейс. Подключи Supabase, чтобы включить настоящие аккаунты и сообщения.", created_at: new Date(Date.now() - 1000 * 60 * 17).toISOString(), profile: { id: "bot-2", username: "guide", display_name: "Проводник" } },
    { id: "m3", channel_id: "demo-general", user_id: "bot-3", content: "Слева можно переключать серверы и каналы. Попробуй отправить сообщение — оно появится в этой демо-сессии.", created_at: new Date(Date.now() - 1000 * 60 * 15).toISOString(), profile: { id: "bot-3", username: "pixel", display_name: "pixel.exe" } }
  ]
};

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || "N";
}
function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [spaces, setSpaces] = useState<Space[]>(demoSpaces);
  const [channelsBySpace, setChannelsBySpace] = useState<Record<string, Channel[]>>(demoChannels);
  const [activeSpaceId, setActiveSpaceId] = useState("demo-lobby");
  const [activeChannelId, setActiveChannelId] = useState("demo-general");
  const [messages, setMessages] = useState<Message[]>(demoMessages["demo-general"] || []);
  const [draft, setDraft] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [members, setMembers] = useState<Profile[]>([]);

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
  const channels = channelsBySpace[activeSpaceId] || [];
  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  const loadProfile = useCallback(async (authUser: any) => {
    if (!supabase || !authUser) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
    if (data) setProfile(data as Profile);
    else {
      const username = String(authUser.email || "user").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "user";
      const fallback = { id: authUser.id, username, display_name: authUser.user_metadata?.display_name || username };
      const { data: inserted } = await supabase.from("profiles").upsert(fallback).select("*").maybeSingle();
      setProfile((inserted || fallback) as Profile);
    }
  }, []);

  const loadSpaces = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data: memberships, error } = await supabase.from("server_members").select("server_id").eq("user_id", uid);
    if (error) { showNotice("Не удалось загрузить серверы. Проверь SQL-схему и политики доступа."); return; }
    const ids = (memberships || []).map((row: any) => row.server_id);
    if (!ids.length) {
      setSpaces([]);
      setChannelsBySpace({});
      return;
    }
    const { data: serverRows } = await supabase.from("servers").select("*").in("id", ids).order("created_at");
    const { data: channelRows } = await supabase.from("channels").select("*").in("server_id", ids).order("created_at");
    const nextSpaces = (serverRows || []) as Space[];
    const nextMap: Record<string, Channel[]> = {};
    for (const channel of (channelRows || []) as Channel[]) {
      nextMap[channel.server_id] ||= [];
      nextMap[channel.server_id].push(channel);
    }
    setSpaces(nextSpaces);
    setChannelsBySpace(nextMap);
    if (nextSpaces.length) {
      setActiveSpaceId(nextSpaces[0].id);
      const first = nextMap[nextSpaces[0].id]?.[0];
      setActiveChannelId(first?.id || "");
    } else {
      setActiveSpaceId("");
      setActiveChannelId("");
    }
  }, [showNotice]);

  const loadMessages = useCallback(async (channelId: string) => {
    if (!channelId) { setMessages([]); return; }
    if (!supabase || channelId.startsWith("demo-")) {
      setMessages(demoMessages[channelId] || []);
      return;
    }
    const { data, error } = await supabase.from("messages")
      .select("id, channel_id, user_id, content, created_at, profiles(id, username, display_name, avatar_url)")
      .eq("channel_id", channelId).order("created_at", { ascending: true }).limit(100);
    if (error) { showNotice("Не удалось загрузить сообщения. Проверь SQL-схему."); setMessages([]); return; }
    setMessages((data || []).map((m: any) => ({ ...m, profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles })));
  }, [showNotice]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      const current = data.session?.user || null;
      setUser(current);
      if (current) {
        await loadProfile(current);
        await loadSpaces(current.id);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user || null;
      setUser(current);
      if (!current) { setProfile(null); setSpaces([]); setChannelsBySpace({}); }
      else {
        window.setTimeout(async () => {
          await loadProfile(current);
          await loadSpaces(current.id);
        }, 0);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile, loadSpaces]);

  useEffect(() => { loadMessages(activeChannelId); }, [activeChannelId, loadMessages]);

  useEffect(() => {
    if (!supabase || !activeChannelId || activeChannelId.startsWith("demo-")) return;
    const channel = supabase.channel(`messages:${activeChannelId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages",
        filter: `channel_id=eq.${activeChannelId}`
      }, async (payload) => {
        const row = payload.new as Message;
        const { data: p } = await supabase!.from("profiles").select("*").eq("id", row.user_id).maybeSingle();
        setMessages((old) => old.some((m) => m.id === row.id) ? old : [...old, { ...row, profile: p as Profile | undefined }]);
      }).subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [activeChannelId]);

  useEffect(() => {
    if (!supabase || !activeChannelId || activeChannelId.startsWith("demo-")) { setMembers([]); return; }
    let cancelled = false;
    (async () => {
      const { data: channelData } = await supabase!.from("channels").select("server_id").eq("id", activeChannelId).maybeSingle();
      if (!channelData || cancelled) return;
      const { data: memberData } = await supabase!.from("server_members").select("user_id").eq("server_id", channelData.server_id);
      const ids = (memberData || []).map((x: any) => x.user_id);
      if (!ids.length) { setMembers([]); return; }
      const { data: people } = await supabase!.from("profiles").select("*").in("id", ids);
      if (!cancelled) setMembers((people || []) as Profile[]);
    })();
    return () => { cancelled = true; };
  }, [activeChannelId]);

  const chooseSpace = (space: Space) => {
    setActiveSpaceId(space.id);
    const next = channelsBySpace[space.id] || [];
    setActiveChannelId(next[0]?.id || "");
    setSidebarOpen(false);
  };
  const chooseChannel = (channel: Channel) => {
    setActiveChannelId(channel.id);
    setSidebarOpen(false);
  };

  async function submitAuth(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setAuthBusy(true); setAuthError("");
    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(),
          password: authPassword,
          options: { data: { display_name: authName.trim() || authEmail.split("@")[0] } }
        });
        if (error) throw error;
        if (data.session) {
          setUser(data.user);
          await loadProfile(data.user);
          showNotice("Аккаунт создан. Добро пожаловать в Nox!");
          setShowAuth(false);
        } else {
          setAuthError("Проверь почту и подтверди регистрацию, затем войди в аккаунт.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        setUser(data.user);
        await loadProfile(data.user);
        await loadSpaces(data.user.id);
        setShowAuth(false);
        showNotice("Ты снова в Nox.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Не удалось выполнить вход.");
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUser(null); setProfile(null); setSpaces(demoSpaces); setChannelsBySpace(demoChannels);
    setActiveSpaceId("demo-lobby"); setActiveChannelId("demo-general");
    showNotice("Ты вышел из аккаунта.");
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeChannel) return;
    if (!supabase || activeChannel.id.startsWith("demo-") || !user) {
      const local: Message = {
        id: crypto.randomUUID(), channel_id: activeChannel.id, user_id: "you",
        content, created_at: new Date().toISOString(),
        profile: { id: "you", username: "you", display_name: "Ты" }
      };
      setMessages((old) => [...old, local]);
      setDraft("");
      return;
    }
    const { error } = await supabase.from("messages").insert({
      channel_id: activeChannel.id, user_id: user.id, content
    });
    if (error) { showNotice("Сообщение не отправлено. Возможно, у тебя нет доступа к каналу."); return; }
    setDraft("");
  }

  async function createSpace(e: FormEvent) {
    e.preventDefault();
    const name = newSpaceName.trim();
    if (!name) return;
    if (!supabase || !user) {
      showNotice("Чтобы создать настоящий сервер, сначала подключи Supabase и войди в аккаунт.");
      return;
    }
    const slug = name.toLowerCase().replace(/[^a-zа-яё0-9_-]+/gi, "-").replace(/^-|-$/g, "").slice(0, 40) || "general";
    const { data: server, error } = await supabase.from("servers").insert({ name, owner_id: user.id }).select("*").single();
    if (error || !server) { showNotice(error?.message || "Не удалось создать сервер."); return; }
    const { error: memberError } = await supabase.from("server_members").insert({ server_id: server.id, user_id: user.id, role: "owner" });
    const { data: channel, error: channelError } = await supabase.from("channels").insert({ server_id: server.id, name: "общий", type: "text" }).select("*").single();
    if (memberError || channelError || !channel) { showNotice("Сервер создан, но не удалось завершить настройку. Проверь SQL-схему."); }
    const nextSpaces = [...spaces, server as Space];
    setSpaces(nextSpaces);
    setChannelsBySpace((old) => ({ ...old, [server.id]: channel ? [channel as Channel] : [] }));
    setActiveSpaceId(server.id); setActiveChannelId(channel?.id || "");
    setNewSpaceName(""); setCreateSpaceOpen(false);
    showNotice(`Сервер «${name}» создан.`);
  }

  async function createChannel(e: FormEvent) {
    e.preventDefault();
    const name = newChannelName.trim().toLowerCase().replace(/\s+/g, "-");
    if (!name || !activeSpace) return;
    if (!supabase || !user || activeSpace.id.startsWith("demo-")) {
      showNotice("Войди в аккаунт, чтобы создавать настоящие каналы.");
      return;
    }
    const { data, error } = await supabase.from("channels")
      .insert({ server_id: activeSpace.id, name, type: "text" }).select("*").single();
    if (error || !data) { showNotice(error?.message || "Не удалось создать канал."); return; }
    setChannelsBySpace((old) => ({ ...old, [activeSpace.id]: [...(old[activeSpace.id] || []), data as Channel] }));
    setActiveChannelId(data.id); setNewChannelName(""); setCreateChannelOpen(false);
    showNotice(`Канал #${name} создан.`);
  }

  const visibleMessages = useMemo(() => messages, [messages]);
  const currentName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Гость";

  return (
    <div className="app-shell">
      <aside className={`server-rail ${sidebarOpen ? "rail-open" : ""}`}>
        <button className="brand-mark" title="Nox" onClick={() => { setActiveSpaceId("demo-lobby"); setActiveChannelId("demo-general"); }}>
          <span className="brand-glyph">n</span>
        </button>
        <div className="rail-separator" />
        {spaces.map((space) => (
          <button key={space.id} className={`server-icon ${activeSpaceId === space.id ? "selected" : ""}`} title={space.name} onClick={() => chooseSpace(space)}>
            <span>{initials(space.name)}</span>
            <i />
          </button>
        ))}
        <button className="server-icon add-server" title="Создать сервер" onClick={() => setCreateSpaceOpen(true)}><Plus size={22} /></button>
        <button className="server-icon explore" title="Обзор"><Compass size={20} /></button>
        <div className="rail-bottom"><button className="tiny-icon" title="Настройки"><Settings size={19} /></button></div>
      </aside>

      <aside className={`channel-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button className="space-heading" onClick={() => showNotice("Настройки сервера появятся в следующем обновлении.")}>
          <span>{activeSpace?.name || "Твои серверы"}</span><ChevronDown size={17} />
        </button>
        <div className="sidebar-scroll">
          <div className="section-heading"><span>ТЕКСТОВЫЕ КАНАЛЫ</span><button title="Создать канал" onClick={() => setCreateChannelOpen(true)}><Plus size={16}/></button></div>
          {channels.length ? channels.map((channel) => (
            <button key={channel.id} className={`channel-item ${activeChannelId === channel.id ? "active" : ""}`} onClick={() => chooseChannel(channel)}>
              <Hash size={18}/><span>{channel.name}</span>
            </button>
          )) : <p className="empty-small">Пока нет каналов.</p>}
          <button className="channel-item add-channel" onClick={() => setCreateChannelOpen(true)}><Plus size={16}/><span>Добавить канал</span></button>

          <div className="sidebar-card">
            <div className="card-icon"><Sparkles size={17}/></div>
            <div><strong>Твоё пространство</strong><p>Создай сервер для друзей, команды или сообщества.</p></div>
            <button onClick={() => setCreateSpaceOpen(true)}>Создать сервер</button>
          </div>
        </div>
        <div className="profile-bar">
          <div className="avatar self-avatar">{initials(currentName)}</div>
          <div className="profile-copy"><strong>{currentName}</strong><span>{user ? "В сети" : "Гостевой режим"}</span></div>
          <button className="profile-action" title={user ? "Выйти" : "Войти"} onClick={() => user ? signOut() : (setAuthMode("signup"), setShowAuth(true))}>
            {user ? <LogOut size={17}/> : <Settings size={17}/>}
          </button>
          <button className="profile-action" title="Микрофон"><Mic size={17}/></button>
          <button className="profile-action" title="Звук"><Headphones size={17}/></button>
        </div>
      </aside>

      <main className="chat-area">
        <header className="chat-header">
          <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20}/></button>
          <Hash size={22} className="header-hash"/>
          <strong>{activeChannel?.name || "выбери-канал"}</strong>
          <div className="header-divider"/>
          <span className="header-topic">Место для хороших разговоров.</span>
          <div className="header-actions">
            <button title="Уведомления" onClick={() => showNotice("Уведомления добавим позже.")}><Bell size={19}/></button>
            <button title="Участники" onClick={() => showNotice(user ? `Участников в сервере: ${members.length || "—"}` : "Войди, чтобы увидеть участников.")}><Users size={19}/></button>
            <button title="Личные сообщения" onClick={() => showNotice("Личные сообщения — следующий этап разработки.")}><MessageCircle size={19}/></button>
            <button title="Поиск" onClick={() => showNotice("Поиск по сообщениям добавим позже.")}><Search size={19}/></button>
          </div>
        </header>

        {!isSupabaseConfigured && (
          <div className="setup-banner">
            <div className="setup-icon"><ShieldCheck size={18}/></div>
            <div><strong>Демо-режим</strong><span>Интерфейс работает локально. Подключи Supabase для аккаунтов и синхронизации между пользователями.</span></div>
            <button onClick={() => showNotice("Открой README.md — там пошаговая настройка Supabase.")}>Как подключить</button>
          </div>
        )}

        <div className="messages-scroll">
          <div className="welcome-block">
            <div className="welcome-orb"><MessageCircle size={27}/></div>
            <h1>Добро пожаловать в #{activeChannel?.name || "Nox"}</h1>
            <p>Это начало канала. Пусть здесь начнётся что-то классное.</p>
          </div>
          {visibleMessages.map((message) => {
            const name = message.profile?.display_name || message.profile?.username || "Пользователь";
            return (
              <article className="message-row" key={message.id}>
                <div className={`avatar message-avatar ${message.user_id === user?.id || message.user_id === "you" ? "own" : ""}`}>{initials(name)}</div>
                <div className="message-body">
                  <div className="message-meta"><strong>{name}</strong><time>{timeLabel(message.created_at)}</time></div>
                  <p>{message.content}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={sendMessage}>
            <button type="button" className="composer-plus" title="Прикрепить файл" onClick={() => showNotice("Загрузка файлов появится в следующей версии.")}><Plus size={22}/></button>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Написать в #${activeChannel?.name || "канал"}`} aria-label="Сообщение" />
            <button type="button" className="composer-tool" title="Эмодзи" onClick={() => setDraft((d) => d + " ✨")}>☺</button>
            <button className="send-button" type="submit" disabled={!draft.trim()} title="Отправить"><Send size={18}/></button>
          </form>
          <p className="composer-hint">Общайся уважительно. Nox пока находится в разработке.</p>
        </div>
      </main>

      <aside className="member-sidebar">
        <div className="member-heading">УЧАСТНИКИ — {user ? members.length : "—"}</div>
        {user && members.length ? members.map((person) => (
          <div className="member-row" key={person.id}>
            <div className="avatar member-avatar">{initials(person.display_name || person.username)}</div>
            <span>{person.display_name || person.username}</span><i className="online-dot"/>
          </div>
        )) : (
          <div className="member-empty">
            <div className="member-empty-icon"><Users size={22}/></div>
            <strong>Здесь пока тихо</strong>
            <p>{user ? "Добавь друзей в своё сообщество." : "Войди в аккаунт, чтобы начать своё сообщество."}</p>
            {!user && <button onClick={() => { setAuthMode("signup"); setShowAuth(true); }}>Создать аккаунт</button>}
          </div>
        )}
        <div className="right-tip"><span className="tip-spark">✦</span><strong>Маленький совет</strong><p>Создай отдельный канал для каждой темы — так разговоры будет проще находить.</p></div>
      </aside>

      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}><X size={15}/></button></div>}

      {showAuth && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setShowAuth(false); }}>
          <form className="modal auth-modal" onSubmit={submitAuth}>
            <button type="button" className="modal-close" onClick={() => setShowAuth(false)}><X size={19}/></button>
            <div className="modal-brand"><span className="brand-glyph">n</span></div>
            <h2>{authMode === "signup" ? "Создай свой аккаунт" : "С возвращением"}</h2>
            <p className="modal-subtitle">{authMode === "signup" ? "Твои люди уже где-то здесь." : "Твои разговоры ждут тебя."}</p>
            {authMode === "signup" && <label>Отображаемое имя<input value={authName} onChange={(e) => setAuthName(e.target.value)} placeholder="Например, pixel.exe" maxLength={32}/></label>}
            <label>Электронная почта<input type="email" required value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"/></label>
            <label>Пароль<input type="password" required minLength={6} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} placeholder="Минимум 6 символов" autoComplete={authMode === "signup" ? "new-password" : "current-password"}/></label>
            {authError && <div className="auth-error">{authError}</div>}
            <button className="primary-button" disabled={authBusy || !isSupabaseConfigured}>
              {authBusy ? <LoaderCircle className="spin" size={18}/> : null}
              {authMode === "signup" ? "Зарегистрироваться" : "Войти"}
            </button>
            {!isSupabaseConfigured && <p className="auth-note">Сначала добавь ключи Supabase в файл .env.local. Инструкция есть в README.</p>}
            <p className="switch-auth">{authMode === "signup" ? "Уже есть аккаунт?" : "Впервые в Nox?"} <button type="button" onClick={() => { setAuthMode(authMode === "signup" ? "signin" : "signup"); setAuthError(""); }}>{authMode === "signup" ? "Войти" : "Создать аккаунт"}</button></p>
          </form>
        </div>
      )}

      {createSpaceOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateSpaceOpen(false); }}>
          <form className="modal" onSubmit={createSpace}>
            <button type="button" className="modal-close" onClick={() => setCreateSpaceOpen(false)}><X size={19}/></button>
            <h2>Создать сервер</h2><p className="modal-subtitle">Собери людей вокруг того, что вам нравится.</p>
            <label>Название сервера<input required maxLength={60} value={newSpaceName} onChange={(e) => setNewSpaceName(e.target.value)} placeholder="Например, Наша компания"/></label>
            {!user && <p className="auth-note">В демо-режиме сервер не сохранится. Для общего сервера настрой Supabase и войди.</p>}
            <button className="primary-button">Создать сервер</button>
          </form>
        </div>
      )}

      {createChannelOpen && (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateChannelOpen(false); }}>
          <form className="modal" onSubmit={createChannel}>
            <button type="button" className="modal-close" onClick={() => setCreateChannelOpen(false)}><X size={19}/></button>
            <h2>Создать канал</h2><p className="modal-subtitle">Что будет обсуждаться в новом канале?</p>
            <label>Название канала<input required maxLength={50} value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} placeholder="например, планы-на-выходные"/></label>
            <button className="primary-button">Создать канал</button>
          </form>
        </div>
      )}
    </div>
  );
}
