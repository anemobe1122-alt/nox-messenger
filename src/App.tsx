import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import "./home.css";
import {
  Hash, Plus, Compass, MessageCircle, Settings, Search, Send, Users,
  ChevronDown, Headphones, Mic, Bell, LogOut, X, LoaderCircle, ShieldCheck,
  Sparkles, Menu, UserRound, Store, MessageSquare, CirclePlus, Trash2
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type Profile = { id: string; username: string; display_name: string | null; avatar_url?: string | null };
type DmContact = Profile & { conversationId?: string };
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
const demoContacts: DmContact[] = [
  { id: "demo-nox", username: "nox", display_name: "Nox" },
  { id: "demo-pixel", username: "pixel", display_name: "Pixel" },
  { id: "demo-night", username: "nightshift", display_name: "Ночная смена" }
];

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
  const [activeView, setActiveView] = useState<"home" | "server">("server");
  const [activeHomeTab, setActiveHomeTab] = useState("Сообщения");
  const [activeDm, setActiveDm] = useState("");
  const [dmContacts, setDmContacts] = useState<DmContact[]>(demoContacts);
  const [peopleResults, setPeopleResults] = useState<Profile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [dmDraft, setDmDraft] = useState("");
  const [dmMessages, setDmMessages] = useState<Record<string, Message[]>>(() => {
    try { return JSON.parse(localStorage.getItem("nox-dm-messages") || "{}"); } catch { return {}; }
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);

  const activeDmContact = dmContacts.find((contact) => contact.id === activeDm);
  const activeDmKey = activeDmContact?.conversationId || activeDm;

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
  const channels = channelsBySpace[activeSpaceId] || [];
  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  useEffect(() => {
    try {
      const savedSpaces = localStorage.getItem("nox-spaces");
      const savedChannels = localStorage.getItem("nox-channels");
      if (savedSpaces) setSpaces(JSON.parse(savedSpaces));
      if (savedChannels) setChannelsBySpace(JSON.parse(savedChannels));
    } catch { /* Ignore invalid local demo data. */ }
  }, []);
  useEffect(() => {
    if (!supabase) {
      localStorage.setItem("nox-spaces", JSON.stringify(spaces));
      localStorage.setItem("nox-channels", JSON.stringify(channelsBySpace));
    }
  }, [spaces, channelsBySpace]);
  useEffect(() => { localStorage.setItem("nox-dm-messages", JSON.stringify(dmMessages)); }, [dmMessages]);

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

  const loadDirectContacts = useCallback(async (uid: string) => {
    if (!supabase) return;
    setDmContacts([]);
    const { data: memberships, error } = await supabase.from("direct_conversation_members")
      .select("conversation_id").eq("user_id", uid);
    if (error) { showNotice("Не удалось загрузить личные чаты. Примени обновлённую Supabase-схему."); return; }
    const conversationIds = [...new Set((memberships || []).map((row: any) => row.conversation_id))];
    if (!conversationIds.length) { setDmContacts([]); return; }
    const { data: people, error: peopleError } = await supabase.from("direct_conversation_members")
      .select("conversation_id, user_id, profiles(id, username, display_name, avatar_url)")
      .in("conversation_id", conversationIds).neq("user_id", uid);
    if (peopleError) { showNotice("Не удалось загрузить список личных чатов."); return; }
    const next = (people || []).flatMap((row: any) => {
      const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return person ? [{ ...person, conversationId: row.conversation_id } as DmContact] : [];
    });
    setDmContacts(next);
  }, [showNotice]);

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
    if (!supabase || channelId.startsWith("demo-") || channelId.startsWith("local-")) {
      let saved: Message[] = [];
      try { saved = JSON.parse(localStorage.getItem(`nox-messages-${channelId}`) || "[]"); } catch { /* Ignore invalid local message data. */ }
      setMessages(saved.length ? saved : demoMessages[channelId] || []);
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
        setActiveDm("");
        await loadProfile(current);
        await loadSpaces(current.id);
        await loadDirectContacts(current.id);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user || null;
      setUser(current);
      if (!current) { setProfile(null); setSpaces(demoSpaces); setChannelsBySpace(demoChannels); setDmContacts(demoContacts); setActiveDm(""); }
      else {
        setActiveDm("");
        window.setTimeout(async () => {
          await loadProfile(current);
          await loadSpaces(current.id);
          await loadDirectContacts(current.id);
        }, 0);
      }
    });
    return () => listener.subscription.unsubscribe();
  }, [loadProfile, loadSpaces, loadDirectContacts]);

  useEffect(() => { loadMessages(activeChannelId); }, [activeChannelId, loadMessages]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchOpen || !supabase || !user || query.length < 2) { setPeopleResults([]); setPeopleLoading(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPeopleLoading(true);
      const [byUsername, byName] = await Promise.all([
        supabase!.from("profiles").select("id, username, display_name, avatar_url").neq("id", user.id).ilike("username", `%${query}%`).limit(20),
        supabase!.from("profiles").select("id, username, display_name, avatar_url").neq("id", user.id).ilike("display_name", `%${query}%`).limit(20)
      ]);
      if (cancelled) return;
      if (byUsername.error || byName.error) showNotice("Не удалось найти пользователей. Проверь подключение Supabase.");
      const unique = new Map<string, Profile>();
      for (const person of [...(byUsername.data || []), ...(byName.data || [])] as Profile[]) unique.set(person.id, person);
      setPeopleResults([...unique.values()].slice(0, 20));
      setPeopleLoading(false);
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [searchOpen, searchQuery, user, showNotice]);

  useEffect(() => {
    if (!activeDm || !user || !activeDmContact?.conversationId || !supabase) {
      if (activeDm) {
        try {
          const local = JSON.parse(localStorage.getItem(`nox-dm-${activeDmKey}`) || "[]");
          setDmMessages((old) => ({ ...old, [activeDmKey]: local }));
        } catch { /* Ignore invalid local direct-message data. */ }
      }
      return;
    }
    let cancelled = false;
    const conversationId = activeDmContact.conversationId;
    (async () => {
      const { data, error } = await supabase!.from("direct_messages")
        .select("id, conversation_id, user_id, content, created_at, profiles(id, username, display_name, avatar_url)")
        .eq("conversation_id", conversationId).order("created_at", { ascending: true }).limit(200);
      if (cancelled) return;
      if (error) { showNotice("Не удалось загрузить сообщения. Примени обновлённую Supabase-схему."); return; }
      const rows = (data || []).map((m: any) => ({
        ...m, channel_id: conversationId,
        profile: Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
      })) as Message[];
      setDmMessages((old) => ({ ...old, [conversationId]: rows }));
    })();
    const channel = supabase.channel(`direct-messages:${conversationId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_messages",
        filter: `conversation_id=eq.${conversationId}`
      }, async (payload) => {
        const row = payload.new as any;
        const { data: person } = await supabase!.from("profiles").select("id, username, display_name, avatar_url").eq("id", row.user_id).maybeSingle();
        const message = { ...row, channel_id: conversationId, profile: person as Profile | undefined } as Message;
        setDmMessages((old) => ({ ...old, [conversationId]: (old[conversationId] || []).some((m) => m.id === message.id) ? old[conversationId] : [...(old[conversationId] || []), message] }));
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "direct_messages" }, (payload) => {
        const old = payload.old as any;
        if (!old?.id) return;
        setDmMessages((messages) => ({ ...messages, [conversationId]: (messages[conversationId] || []).filter((message) => message.id !== old.id) }));
      }).subscribe();
    return () => { cancelled = true; supabase!.removeChannel(channel); };
  }, [activeDm, activeDmContact?.conversationId, activeDmKey, user, showNotice]);

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
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const old = payload.old as any;
        if (!old?.id) return;
        setMessages((oldMessages) => oldMessages.filter((message) => message.id !== old.id));
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
        if (data.session && data.user) {
          setUser(data.user);
          await loadProfile(data.user);
          await loadSpaces(data.user.id);
          await loadDirectContacts(data.user.id);
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
    setDmContacts(demoContacts); setActiveDm("");
    setActiveSpaceId("demo-lobby"); setActiveChannelId("demo-general");
    showNotice("Ты вышел из аккаунта.");
  }

  async function openDirectChat(person: Profile) {
    if (!supabase || !user) {
      setAuthMode("signup"); setShowAuth(true);
      showNotice("Войди в аккаунт, чтобы искать пользователей и писать им.");
      return;
    }
    if (person.id === user.id) return;
    let conversationId = dmContacts.find((contact) => contact.id === person.id)?.conversationId;
    if (!conversationId) {
      const { data, error } = await supabase.rpc("create_or_get_direct_conversation", { target_user_id: person.id });
      if (error || !data) {
        console.error("Failed to open direct chat:", error);
        const reason = error?.message ? ` ${error.message}` : " Функция создания чата не вернула результат.";
        showNotice(`Не удалось открыть чат.${reason} Примени supabase/direct-messages.sql в SQL Editor Supabase.`);
        return;
      }
      conversationId = data as string;
    }
    const contact = { ...person, conversationId } as DmContact;
    setDmContacts((old) => [contact, ...old.filter((item) => item.id !== person.id)]);
    setActiveDm(person.id); setActiveView("home"); setActiveHomeTab("Сообщения"); setSearchOpen(false); setSidebarOpen(false);
  }

  async function sendDm(e: FormEvent) {
    e.preventDefault();
    const content = dmDraft.trim();
    if (!content || !activeDm || !activeDmContact) return;
    if (supabase && user && activeDmContact.conversationId) {
      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: activeDmContact.conversationId, user_id: user.id, content
      });
      if (error) { showNotice("Сообщение не отправлено. Возможно, у тебя нет доступа к чату."); return; }
      setDmDraft("");
      return;
    }
    const item: Message = {
      id: crypto.randomUUID(), channel_id: `dm-${activeDm}`, user_id: "you", content,
      created_at: new Date().toISOString(), profile: { id: "you", username: "you", display_name: currentName }
    };
    setDmMessages((old) => {
      const next = { ...old, [activeDmKey]: [...(old[activeDmKey] || []), item] };
      localStorage.setItem(`nox-dm-${activeDmKey}`, JSON.stringify(next[activeDmKey]));
      return next;
    });
    setDmDraft("");
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
      const next = [...messages, local];
      localStorage.setItem(`nox-messages-${activeChannel.id}`, JSON.stringify(next));
      setDraft("");
      return;
    }
    const { error } = await supabase.from("messages").insert({
      channel_id: activeChannel.id, user_id: user.id, content
    });
    if (error) { showNotice("Сообщение не отправлено. Возможно, у тебя нет доступа к каналу."); return; }
    setDraft("");
  }

  async function deleteMessage(message: Message, direct: boolean) {
    const isLocal = message.user_id === "you";
    if (!isLocal && (!user || message.user_id !== user.id)) return;
    if (direct && !isLocal && !activeDmContact?.conversationId) return;
    if (!direct && !isLocal && !activeChannel?.id) return;

    if (!isLocal && supabase && user) {
      const conversationId = activeDmContact?.conversationId;
      const channelId = activeChannel?.id;
      if (direct && !conversationId) return;
      if (!direct && !channelId) return;
      const { data, error } = direct
        ? await supabase.from("direct_messages").delete().eq("id", message.id).eq("conversation_id", conversationId!).eq("user_id", user.id).select("id").maybeSingle()
        : await supabase.from("messages").delete().eq("id", message.id).eq("channel_id", channelId!).eq("user_id", user.id).select("id").maybeSingle();
      if (error || !data) {
        showNotice(error?.message ? `Не удалось удалить. Примени supabase/message-deletion.sql: ${error.message}` : "Не удалось удалить сообщение.");
        return;
      }
    }

    if (direct) {
      setDmMessages((old) => {
        const next = (old[activeDmKey] || []).filter((item) => item.id !== message.id);
        if (isLocal) localStorage.setItem(`nox-dm-${activeDmKey}`, JSON.stringify(next));
        return { ...old, [activeDmKey]: next };
      });
    } else {
      setMessages((old) => {
        const next = old.filter((item) => item.id !== message.id);
        if (isLocal) localStorage.setItem(`nox-messages-${activeChannel?.id}`, JSON.stringify(next));
        return next;
      });
    }
    showNotice("Сообщение удалено.");
  }

  async function createSpace(e: FormEvent) {
    e.preventDefault();
    const name = newSpaceName.trim();
    if (!name) return;
    if (!supabase || !user) {
      const space: Space = { id: `local-${crypto.randomUUID()}`, name };
      const channel: Channel = { id: `local-${crypto.randomUUID()}`, server_id: space.id, name: "общий", type: "text" };
      setSpaces((old) => [...old, space]);
      setChannelsBySpace((old) => ({ ...old, [space.id]: [channel] }));
      setActiveSpaceId(space.id); setActiveChannelId(channel.id); setActiveView("server");
      setNewSpaceName(""); setCreateSpaceOpen(false);
      showNotice(`Сервер «${name}» создан в этом браузере.`);
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
    if (!name) return;
    if (!activeSpace) { setCreateChannelOpen(false); setCreateSpaceOpen(true); showNotice("Сначала создай сервер."); return; }
    if (!supabase || !user || activeSpace.id.startsWith("demo-") || activeSpace.id.startsWith("local-")) {
      const channel: Channel = { id: `local-${crypto.randomUUID()}`, server_id: activeSpace.id, name, type: "text" };
      setChannelsBySpace((old) => ({ ...old, [activeSpace.id]: [...(old[activeSpace.id] || []), channel] }));
      setActiveChannelId(channel.id); setNewChannelName(""); setCreateChannelOpen(false);
      showNotice(`Канал #${name} создан.`);
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
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return [];
    const all = [...Object.values(demoMessages).flat(), ...messages];
    return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i && m.content.toLocaleLowerCase().includes(q)).slice(0, 20);
  }, [messages, searchQuery]);
  const currentName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Гость";
  const homeActionLabel = activeHomeTab === "Друзья"
    ? "Найти друзей"
    : ["Сообщения", "Найти беседу", "Новая беседа"].includes(activeHomeTab)
      ? "Новая беседа"
      : "";

  return (
    <div className={`app-shell ${activeView === "home" ? "home-shell" : ""} ${!membersOpen ? "members-hidden" : ""}`}>
      <aside className={`server-rail ${sidebarOpen ? "rail-open" : ""}`}>
        <button className={`brand-mark ${activeView === "home" ? "brand-active" : ""}`} title="Главная" onClick={() => { setActiveView("home"); setActiveHomeTab("Сообщения"); setActiveDm(""); setSidebarOpen(false); }}>
          <span className="brand-glyph">n</span>
        </button>
        <div className="rail-separator" />
        {spaces.map((space) => (
          <button key={space.id} className={`server-icon ${activeView === "server" && activeSpaceId === space.id ? "selected" : ""}`} title={space.name} onClick={() => { setActiveView("server"); chooseSpace(space); }}>
            <span>{initials(space.name)}</span>
            <i />
          </button>
        ))}
        <button className="server-icon add-server" title="Создать сервер" onClick={() => setCreateSpaceOpen(true)}><Plus size={22} /></button>
        <button className="server-icon explore" title="Обзор сообществ" onClick={() => showNotice("Обзор сообществ: здесь появятся открытые серверы.")}><Compass size={20} /></button>
        <div className="rail-bottom"><button className="tiny-icon" title="Настройки профиля" onClick={() => showNotice(`Ты вошёл как ${currentName}. ${user ? "Настройки аккаунта доступны после подключения Supabase." : "Демо-режим сохраняет данные в этом браузере."}`)}><Settings size={19} /></button></div>
      </aside>

      {activeView === "home" ? <aside className={`channel-sidebar home-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button className="home-search" onClick={() => setSearchOpen(true)}><Search size={17}/><span>Найти или начать беседу</span></button>
        <nav className="home-nav">
          {[{label:"Друзья", icon:<UserRound size={19}/>},{label:"Nitro", icon:<Sparkles size={19}/>},{label:"Магазин", icon:<Store size={19}/>}].map((item) => <button key={item.label} className={`home-nav-item ${activeHomeTab === item.label ? "active" : ""}`} onClick={() => { setActiveHomeTab(item.label); setActiveDm(""); }}>{item.icon}<span>{item.label}</span>{item.label === "Nitro" && <small>ПРЕДЛОЖЕНИЕ</small>}</button>)}
        </nav>
        <div className="dm-heading"><span>ЛИЧНЫЕ СООБЩЕНИЯ</span><button title="Новая беседа" onClick={() => setSearchOpen(true)}><Plus size={18}/></button></div>
        <div className="dm-list">
          {dmContacts.map((person) => { const name = person.display_name || person.username; return <button key={person.id} className={`dm-item ${activeDm === person.id ? "active" : ""}`} onClick={() => { setActiveDm(person.id); setActiveHomeTab("Сообщения"); }}><span className="dm-avatar">{initials(name)}</span><span className="dm-name">{name}</span><i/></button>; })}
          {!dmContacts.length && <p className="empty-small">Пока нет личных чатов.</p>}
        </div>
        <div className="profile-bar">
          <div className="avatar self-avatar">{initials(currentName)}</div><div className="profile-copy"><strong>{currentName}</strong><span>{user ? "В сети" : "Гостевой режим"}</span></div>
          <button className="profile-action" title={user ? "Выйти" : "Войти"} onClick={() => user ? signOut() : (setAuthMode("signup"), setShowAuth(true))}>{user ? <LogOut size={17}/> : <Settings size={17}/>}</button>
          <button className={`profile-action ${muted ? "control-active" : ""}`} title={muted ? "Включить микрофон" : "Выключить микрофон"} onClick={() => { setMuted(!muted); showNotice(muted ? "Микрофон включён" : "Микрофон выключен"); }}><Mic size={17}/></button><button className={`profile-action ${deafened ? "control-active" : ""}`} title={deafened ? "Включить звук" : "Выключить звук"} onClick={() => { setDeafened(!deafened); showNotice(deafened ? "Звук включён" : "Звук выключен"); }}><Headphones size={17}/></button>
        </div>
      </aside> : <aside className={`channel-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button className="space-heading" onClick={() => setCreateSpaceOpen(true)} title="Открыть действия сервера">
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
          <button className={`profile-action ${muted ? "control-active" : ""}`} title={muted ? "Включить микрофон" : "Выключить микрофон"} onClick={() => { setMuted(!muted); showNotice(muted ? "Микрофон включён" : "Микрофон выключен"); }}><Mic size={17}/></button>
          <button className={`profile-action ${deafened ? "control-active" : ""}`} title={deafened ? "Включить звук" : "Выключить звук"} onClick={() => { setDeafened(!deafened); showNotice(deafened ? "Звук включён" : "Звук выключен"); }}><Headphones size={17}/></button>
        </div>
      </aside>}

      {activeView === "home" ? <main className="chat-area home-area">
        <header className="chat-header home-header"><button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20}/></button><strong>{activeDmContact ? (activeDmContact.display_name || activeDmContact.username) : activeHomeTab}</strong><div className="header-divider"/><span className="header-topic">Nox — место для твоих разговоров</span><div className="header-actions"><button title="Поиск" onClick={() => setSearchOpen(true)}><Search size={19}/></button><button title="Новая беседа" onClick={() => setSearchOpen(true)}><CirclePlus size={19}/></button></div></header>
        {activeDm ? <>
          <div className="dm-conversation dm-chat">
            <div className="dm-conversation-avatar">{initials(activeDmContact?.display_name || activeDmContact?.username || "N")}</div>
            <h1>{activeDmContact?.display_name || activeDmContact?.username || "Личные сообщения"}</h1>
            <p>Начало вашей переписки.</p>
            {(dmMessages[activeDmKey] || []).map((m) => {
              const isOwn = m.user_id === user?.id || m.user_id === "you";
              const sender = isOwn ? currentName : (m.profile?.display_name || m.profile?.username || activeDmContact?.display_name || "Пользователь");
              return <article className="message-row" key={m.id}>
                <div className={`avatar message-avatar ${isOwn ? "own" : ""}`}>{initials(sender)}</div>
                <div className="message-body">
                  <div className="message-meta"><strong>{sender}</strong><time>{timeLabel(m.created_at)}</time>
                    {isOwn && <button type="button" className="message-delete-button" title="Удалить сообщение" aria-label="Удалить сообщение" onClick={() => void deleteMessage(m, true)}><Trash2 size={15}/></button>}
                  </div>
                  <p>{m.content}</p>
                </div>
              </article>;
            })}
          </div>
          <div className="composer-wrap"><form className="composer" onSubmit={sendDm}><input value={dmDraft} onChange={(e) => setDmDraft(e.target.value)} placeholder={`Написать @${activeDmContact?.username || "пользователю"}`} aria-label="Личное сообщение"/><button className="send-button" type="submit" disabled={!dmDraft.trim()} title="Отправить"><Send size={18}/></button></form></div>
        </> : <div className="home-content">
          <div className="home-welcome"><div className="home-welcome-icon"><MessageCircle size={25}/></div><span>ТВОЙ УГОЛОК В NOX</span><h1>{activeHomeTab === "Сообщения" ? "Рады тебя видеть" : activeHomeTab}</h1><p>{activeHomeTab === "Друзья" ? "Находи друзей и начинай новые беседы." : activeHomeTab === "Сообщения" || activeHomeTab === "Найти беседу" || activeHomeTab === "Новая беседа" ? "Начни личную беседу или продолжи общение." : activeHomeTab === "Nitro" ? "Дополнительные возможности появятся позже." : activeHomeTab === "Магазин" ? "Магазин оформления появится позже." : "Общайся, открывай сообщества и оставайся на связи."}</p>{homeActionLabel && <button onClick={() => setSearchOpen(true)}><UserRound size={17}/> {homeActionLabel}</button>}</div>
          <div className="home-section-title"><strong>БЫСТРЫЙ СТАРТ</strong></div><div className="home-cards"><button onClick={() => { if (dmContacts[0]) setActiveDm(dmContacts[0].id); else setSearchOpen(true); }}><span className="quick-icon purple"><MessageSquare size={20}/></span><strong>Личные сообщения</strong><small>Продолжи беседу</small></button><button onClick={() => { if (spaces[0]) { setActiveView("server"); chooseSpace(spaces[0]); } else setCreateSpaceOpen(true); }}><span className="quick-icon green"><Compass size={20}/></span><strong>Твои серверы</strong><small>Вернись в сообщество</small></button></div>
        </div>}
      </main> : <main className="chat-area">
        <header className="chat-header">
          <button className="mobile-menu" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20}/></button>
          <Hash size={22} className="header-hash"/>
          <strong>{activeChannel?.name || "выбери-канал"}</strong>
          <div className="header-divider"/>
          <span className="header-topic">Место для хороших разговоров.</span>
          <div className="header-actions">
            <button className={notificationsOn ? "" : "control-active"} title={notificationsOn ? "Отключить уведомления канала" : "Включить уведомления канала"} onClick={() => { setNotificationsOn(!notificationsOn); showNotice(notificationsOn ? "Уведомления канала отключены" : "Уведомления канала включены"); }}><Bell size={19}/></button>
            <button title="Участники" onClick={() => setMembersOpen(!membersOpen)}><Users size={19}/></button>
            <button title="Личные сообщения" onClick={() => { setActiveView("home"); setActiveDm(dmContacts[0]?.id || ""); setSidebarOpen(false); if (!dmContacts.length) setSearchOpen(true); }}><MessageCircle size={19}/></button>
            <button title="Поиск по сообщениям" onClick={() => setSearchOpen(true)}><Search size={19}/></button>
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
            const isOwn = message.user_id === user?.id || message.user_id === "you";
            return (
              <article className="message-row" key={message.id}>
                <div className={`avatar message-avatar ${isOwn ? "own" : ""}`}>{initials(name)}</div>
                <div className="message-body">
                  <div className="message-meta"><strong>{name}</strong><time>{timeLabel(message.created_at)}</time>
                    {isOwn && <button type="button" className="message-delete-button" title="Удалить сообщение" aria-label="Удалить сообщение" onClick={() => void deleteMessage(message, false)}><Trash2 size={15}/></button>}
                  </div>
                  <p>{message.content}</p>
                </div>
              </article>
            );
          })}
        </div>

        <div className="composer-wrap">
          <form className="composer" onSubmit={sendMessage}>
            <label className="composer-plus" title="Прикрепить файл"><Plus size={22}/><input type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) setDraft((d) => `${d}${d ? " " : ""}[Файл: ${file.name}]`); e.currentTarget.value = ""; }}/></label>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Написать в #${activeChannel?.name || "канал"}`} aria-label="Сообщение" />
            <button type="button" className="composer-tool" title="Эмодзи" onClick={() => setDraft((d) => d + " ✨")}>☺</button>
            <button className="send-button" type="submit" disabled={!draft.trim()} title="Отправить"><Send size={18}/></button>
          </form>
          <p className="composer-hint">Общайся уважительно. Nox пока находится в разработке.</p>
        </div>
      </main>}

      {activeView === "server" && membersOpen && <aside className="member-sidebar">
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
      </aside>}

      {searchOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
        <div className="modal search-modal"><button type="button" className="modal-close" onClick={() => setSearchOpen(false)}><X size={19}/></button><h2>Поиск пользователей</h2><label>Ник или отображаемое имя<input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Например, player123"/></label><div className="search-results"><strong className="search-label">ЗАРЕГИСТРИРОВАННЫЕ ПОЛЬЗОВАТЕЛИ</strong>{!user && <div className="search-empty"><p>Войди в аккаунт, чтобы искать людей и переписываться с ними.</p><button className="primary-button" onClick={() => { setSearchOpen(false); setAuthMode("signin"); setShowAuth(true); }}>Войти в аккаунт</button></div>}{user && searchQuery.trim().length < 2 && <p className="empty-small">Введи хотя бы 2 символа для поиска.</p>}{user && peopleLoading && <p className="empty-small">Ищу пользователей…</p>}{user && searchQuery.trim().length >= 2 && !peopleLoading && !peopleResults.length && <p className="empty-small">Никого не нашёл. Проверь написание.</p>}{user && peopleResults.map((person) => { const name = person.display_name || person.username; return <button key={person.id} className="search-result contact-result" onClick={() => void openDirectChat(person)}><span className="dm-avatar">{initials(name)}</span><span className="person-result-copy"><strong>{name}</strong><small>@{person.username}</small></span><span className="person-message-action">Написать</span></button>; })}<strong className="search-label">ПОИСК ПО СООБЩЕНИЯМ</strong>{searchResults.map((m) => <button key={`${m.channel_id}-${m.id}`} className="search-result" onClick={() => { const target = spaces.flatMap((s) => channelsBySpace[s.id] || []).find((c) => c.id === m.channel_id); if (target) { setActiveView("server"); setActiveSpaceId(target.server_id); setActiveChannelId(target.id); } else showNotice(`Сообщение из канала #${m.channel_id.replace(/^demo-/, "")}`); setSearchOpen(false); }}><strong>#{(channels.find((c) => c.id === m.channel_id)?.name || m.channel_id.replace(/^demo-/, ""))}</strong><span>{m.content}</span></button>)}</div></div>
      </div>}

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
