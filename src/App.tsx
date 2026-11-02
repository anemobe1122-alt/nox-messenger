import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, FormEvent, MouseEvent as ReactMouseEvent } from "react";
import "./home.css";
import {
  Hash, Plus, Compass, MessageCircle, Settings, Search, Send, Users, ArrowLeft,
  ChevronDown, Headphones, Mic, Bell, LogOut, X, LoaderCircle, ShieldCheck,
  Sparkles, UserRound, Store, MessageSquare, CirclePlus, Trash2, UserPlus, UserCheck, ImagePlus, Images, Heart, Reply, Forward, MoreHorizontal
} from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

type PresenceStatus = "online" | "idle" | "dnd" | "invisible";
type Profile = { id: string; username: string; display_name: string | null; avatar_url?: string | null; presence_status?: PresenceStatus; bio?: string | null; nitro_expires_at?: string | null; nitro_banner_url?: string | null; nitro_frame?: string | null; nitro_accent_color?: string | null; nitro_avatar_bg?: string | null };
type DmContact = Profile & { conversationId?: string };
type FriendRelation = Profile & { requestId: string; requesterId: string; addresseeId: string; status: "pending" | "accepted" };
type Space = { id: string; name: string; owner_id?: string; created_at?: string };
type Channel = { id: string; server_id: string; name: string; type?: string; slowmode_seconds?: number };
type Message = { id: string; channel_id: string; user_id: string; content: string; created_at: string; profile?: Profile; message_type?: "text" | "server_invite"; metadata?: Record<string, any> | null };
type GiphyGif = { id: string; title?: string; images?: { original?: { url?: string }; fixed_width?: { url?: string }; fixed_width_small?: { url?: string } } };
function MessageContent({ content }: { content: string }) {
  if (content.startsWith("GIF:")) { const url = content.slice(4).trim(); if (/^https:\/\//i.test(url)) return <a className="message-gif-link" href={url} target="_blank" rel="noreferrer"><img className="message-gif" src={url} alt="GIF" loading="lazy" /></a>; }
  return <p>{content}</p>;
}

function initials(value: string) {
  return value.trim().slice(0, 2).toUpperCase() || "N";
}
function ProfileAvatar({ profile, name, className, avatarBackground }: { profile?: Profile | null; name: string; className: string; avatarBackground?: string }) {
  const avatarUrl = profile?.avatar_url || "";
  const isGifAvatar = /\\.gif(?:$|[?#])/i.test(avatarUrl);
  const avatarImageClass = className.replace(/nitro-frame-[\\w-]+/g, "").trim();
  const avatar = avatarUrl && !isGifAvatar
    ? <img className={`${avatarImageClass} profile-avatar-image`} src={avatarUrl} alt={`${name} — аватар`} />
    : <span className={avatarImageClass}>{initials(name)}</span>;
  const avatarWithBackground = <span className={`avatar-background-wrap ${className}`} style={avatarBackground ? { backgroundColor: avatarBackground } : undefined}>{avatar}</span>;
  return profile?.presence_status ? <span className="avatar-presence-wrap">{avatarWithBackground}<i className={`presence-dot status-${profile.presence_status}`} title={profile.presence_status === "invisible" ? "Не в сети" : presenceLabel(profile.presence_status)} /></span> : avatarWithBackground;
}
function presenceLabel(status: PresenceStatus) {
  return ({ online: "В сети", idle: "Неактивен", dnd: "Не беспокоить", invisible: "Невидимый" } as const)[status];
}
const presenceOptions: { value: PresenceStatus; label: string; hint: string }[] = [
  { value: "online", label: "В сети", hint: "Ты доступен для общения" },
  { value: "idle", label: "Неактивен", hint: "Показывать, что ты отошёл" },
  { value: "dnd", label: "Не беспокоить", hint: "Отключить всплывающие уведомления" },
  { value: "invisible", label: "Невидимый", hint: "Показывать тебя не в сети" }
];
function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profilePopoverOpen, setProfilePopoverOpen] = useState(false);
  const [isNoxAdmin, setIsNoxAdmin] = useState(false);
  const [nitroAdminOpen, setNitroAdminOpen] = useState(false);
  const [nitroTargetUsername, setNitroTargetUsername] = useState("");
  const [nitroDays, setNitroDays] = useState("30");
  const [nitroAdminBusy, setNitroAdminBusy] = useState(false);
  const [memberCardProfile, setMemberCardProfile] = useState<Profile | null>(null);
  const [memberCardAnchor, setMemberCardAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [memberCardIsOwn, setMemberCardIsOwn] = useState(false);
  const [messageReactions, setMessageReactions] = useState<Record<string, string[]>>({});
  const [messageMenuOpen, setMessageMenuOpen] = useState<string | null>(null);
  const dmScrollRef = useRef<HTMLDivElement>(null);
  const channelScrollRef = useRef<HTMLDivElement>(null);
  const [replyTarget, setReplyTarget] = useState<{ id: string; userId: string; author: string; content: string; direct: boolean } | null>(null);
  const [profilePopoverAnchor, setProfilePopoverAnchor] = useState<{ left: number; bottom: number } | null>(null);
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  const [profileUsernameDraft, setProfileUsernameDraft] = useState("");
  const [profileNameDraft, setProfileNameDraft] = useState("");
  const [profileBioDraft, setProfileBioDraft] = useState("");
  const [nitroBannerDraft, setNitroBannerDraft] = useState("");
  const [nitroFrameDraft, setNitroFrameDraft] = useState("none");
  const [nitroAccentDraft, setNitroAccentDraft] = useState("#8b75ff");
  const [nitroAvatarBgDraft, setNitroAvatarBgDraft] = useState("#29243b");
  const [profileSaving, setProfileSaving] = useState(false);
  const [friendRelations, setFriendRelations] = useState<FriendRelation[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [presenceMenuOpen, setPresenceMenuOpen] = useState(false);
  const [presence, setPresence] = useState<PresenceStatus>(() => (localStorage.getItem("nox-presence") as PresenceStatus) || "online");
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [channelsBySpace, setChannelsBySpace] = useState<Record<string, Channel[]>>({});
  const [activeSpaceId, setActiveSpaceId] = useState("");
  const [activeChannelId, setActiveChannelId] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadChannels, setUnreadChannels] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState("");
  const [showAuth, setShowAuth] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authName, setAuthName] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pullRefreshDistance, setPullRefreshDistance] = useState(0);
  const [createSpaceOpen, setCreateSpaceOpen] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [createChannelOpen, setCreateChannelOpen] = useState(false);
  const [newChannelName, setNewChannelName] = useState("");
  const [channelMenuOpen, setChannelMenuOpen] = useState(false);
  const [channelMenuFor, setChannelMenuFor] = useState("");
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [serverNameDraft, setServerNameDraft] = useState("");
  const [serverInviteOpen, setServerInviteOpen] = useState(false);
  const [invitingFriendId, setInvitingFriendId] = useState("");
  const [acceptingInviteId, setAcceptingInviteId] = useState("");
  const [deleteServerOpen, setDeleteServerOpen] = useState(false);
  const [channelSettingsOpen, setChannelSettingsOpen] = useState(false);
  const [deleteChannelOpen, setDeleteChannelOpen] = useState(false);
  const [slowmodeDraft, setSlowmodeDraft] = useState("0");
  const [slowmodeUntil, setSlowmodeUntil] = useState<Record<string, number>>({});
  const [slowmodeRemaining, setSlowmodeRemaining] = useState(0);
  const [members, setMembers] = useState<Profile[]>([]);
  const [activeView, setActiveView] = useState<"home" | "server">("home");
  const [activeHomeTab, setActiveHomeTab] = useState("Сообщения");
  const [activeDm, setActiveDm] = useState("");
  const [dmContacts, setDmContacts] = useState<DmContact[]>([]);
  const [peopleResults, setPeopleResults] = useState<Profile[]>([]);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [dmDraft, setDmDraft] = useState("");
  const [gifPickerFor, setGifPickerFor] = useState<"dm" | "channel" | null>(null);
  const [gifQuery, setGifQuery] = useState("");
  const [gifResults, setGifResults] = useState<GiphyGif[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
  const [gifError, setGifError] = useState("");
  const [dmMessages, setDmMessages] = useState<Record<string, Message[]>>(() => {
    try { return JSON.parse(localStorage.getItem("nox-dm-messages") || "{}"); } catch { return {}; }
  });
  const [unreadDms, setUnreadDms] = useState<Record<string, number>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [notificationsOn, setNotificationsOn] = useState(true);
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [membersOpen, setMembersOpen] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function checkNoxAdmin() {
      if (!supabase || !user) { setIsNoxAdmin(false); return; }
      const { data, error } = await supabase.rpc("is_nox_admin");
      if (!cancelled) setIsNoxAdmin(!error && data === true);
    }
    void checkNoxAdmin();
    return () => { cancelled = true; };
  }, [user]);

  async function submitNitroGrant(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !isNoxAdmin) return;
    const username = nitroTargetUsername.trim().replace(/^@/, "");
    const days = Number(nitroDays);
    if (!username || !Number.isInteger(days) || days < 1 || days > 3650) {
      showNotice("Укажи ник и срок от 1 до 3650 дней.");
      return;
    }
    setNitroAdminBusy(true);
    const { data, error } = await supabase.rpc("admin_grant_nitro", { target_username: username, duration_days: days });
    setNitroAdminBusy(false);
    if (error) { showNotice("Не удалось выдать Nitro: " + error.message); return; }
    showNotice(`Nitro выдан пользователю @${username} до ${new Date(data).toLocaleDateString("ru-RU")}.`);
    setNitroTargetUsername("");
  }

  async function revokeNitro(username: string) {
    if (!supabase || !isNoxAdmin) return;
    setNitroAdminBusy(true);
    const { error } = await supabase.rpc("admin_revoke_nitro", { target_username: username.trim().replace(/^@/, "") });
    setNitroAdminBusy(false);
    if (error) { showNotice("Не удалось снять Nitro: " + error.message); return; }
    showNotice("Nitro снят с @" + username.replace(/^@/, "") + ".");
  }

  const activeDmContact = dmContacts.find((contact) => contact.id === activeDm);
  const activeDmKey = activeDmContact?.conversationId || activeDm;

  const activeSpace = spaces.find((s) => s.id === activeSpaceId) || spaces[0];
  const channels = channelsBySpace[activeSpaceId] || [];
  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0];
  const canManageChannels = !supabase || activeSpace?.id.startsWith("demo-") || activeSpace?.id.startsWith("local-") || activeSpace?.owner_id === user?.id;
  const canInviteFriends = !!user && !!activeSpace && (activeSpace.owner_id === user.id || members.some((member) => member.id === user.id));

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 3500);
  }, []);

  useEffect(() => { localStorage.setItem("nox-dm-messages", JSON.stringify(dmMessages)); }, [dmMessages]);

  useEffect(() => {
    if (!gifPickerFor) return;
    const apiKey = import.meta.env.VITE_GIPHY_API_KEY;
    if (!apiKey) { setGifResults([]); setGifError("Для поиска GIF добавь VITE_GIPHY_API_KEY в GitHub Actions Variables."); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setGifLoading(true); setGifError("");
      try {
        const endpoint = gifQuery.trim()
          ? `https://api.giphy.com/v1/gifs/search?api_key=${apiKey}&q=${encodeURIComponent(gifQuery.trim())}&limit=24&rating=pg-13&lang=ru`
          : `https://api.giphy.com/v1/gifs/trending?api_key=${apiKey}&limit=24&rating=pg-13`;
        const response = await fetch(endpoint, { signal: controller.signal });
        if (!response.ok) throw new Error(`GIPHY вернул ошибку ${response.status}`);
        const payload = await response.json();
        setGifResults(Array.isArray(payload.data) ? payload.data : []);
      } catch (error) { if (!controller.signal.aborted) setGifError(error instanceof Error ? error.message : "Не удалось загрузить GIF."); }
      finally { if (!controller.signal.aborted) setGifLoading(false); }
    }, gifQuery.trim() ? 350 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [gifPickerFor, gifQuery]);

  useEffect(() => {
    if (!window.matchMedia("(max-width: 760px)").matches) return;
    let startY: number | null = null;
    let activeScroller: HTMLElement | null = null;
    let distance = 0;
    const scrollerSelector = ".sidebar-scroll, .dm-list, .messages-scroll, .dm-chat, .home-content";
    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) { startY = null; return; }
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) { startY = null; return; }
      activeScroller = target?.closest(scrollerSelector) as HTMLElement | null;
      if (activeScroller && activeScroller.scrollTop > 0) { startY = null; return; }
      startY = event.touches[0].clientY;
      distance = 0;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (startY === null || event.touches.length !== 1) return;
      if (activeScroller && activeScroller.scrollTop > 0) return;
      const nextDistance = event.touches[0].clientY - startY;
      if (nextDistance <= 12) return;
      distance = nextDistance;
      if (event.cancelable) event.preventDefault();
      setPullRefreshDistance(Math.min(distance, 96));
    };
    const onTouchEnd = () => {
      const shouldRefresh = distance >= 82;
      startY = null;
      activeScroller = null;
      distance = 0;
      setPullRefreshDistance(0);
      if (shouldRefresh) window.location.reload();
    };
    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  const loadProfile = useCallback(async (authUser: any) => {
    if (!supabase || !authUser) return;
    const { data } = await supabase.from("profiles").select("*").eq("id", authUser.id).maybeSingle();
    if (data) { setProfile(data as Profile); setPresence((data.presence_status as PresenceStatus) || "online"); }
    else {
      const username = String(authUser.email || "user").split("@")[0].replace(/[^a-zA-Z0-9_]/g, "").slice(0, 24) || "user";
      const fallback = { id: authUser.id, username, display_name: authUser.user_metadata?.display_name || username, presence_status: "online" as PresenceStatus };
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
      .select("conversation_id, user_id, profiles(id, username, display_name, avatar_url, presence_status, bio)")
      .in("conversation_id", conversationIds).neq("user_id", uid);
    if (peopleError) { showNotice("Не удалось загрузить список личных чатов."); return; }
    const next = (people || []).flatMap((row: any) => {
      const person = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
      return person ? [{ ...person, conversationId: row.conversation_id } as DmContact] : [];
    });
    setDmContacts(next);
  }, [showNotice]);

  const loadFriendRelations = useCallback(async (uid: string) => {
    if (!supabase) return;
    const { data: relations, error } = await supabase.from("friend_requests")
      .select("id, requester_id, addressee_id, status")
      .or(`requester_id.eq.${uid},addressee_id.eq.${uid}`)
      .order("created_at", { ascending: false });
    if (error) {
      showNotice("Не удалось загрузить друзей. Примени supabase/nox-upgrade.sql.");
      return;
    }
    const rows = relations || [];
    const personIds = [...new Set(rows.map((row: any) => row.requester_id === uid ? row.addressee_id : row.requester_id))];
    if (!personIds.length) { setFriendRelations([]); return; }
    const { data: people, error: peopleError } = await supabase.from("profiles")
      .select("id, username, display_name, avatar_url, presence_status, bio, nitro_expires_at, nitro_banner_url, nitro_frame, nitro_accent_color, nitro_avatar_bg").in("id", personIds);
    if (peopleError) { showNotice("Не удалось загрузить профили друзей."); return; }
    const profilesById = new Map((people || []).map((person: any) => [person.id, person as Profile]));
    setFriendRelations(rows.flatMap((row: any) => {
      const personId = row.requester_id === uid ? row.addressee_id : row.requester_id;
      const person = profilesById.get(personId);
      return person ? [{ ...person, requestId: row.id, requesterId: row.requester_id, addresseeId: row.addressee_id, status: row.status } as FriendRelation] : [];
    }));
  }, [showNotice]);

  async function choosePresence(next: PresenceStatus) {
    setPresence(next);
    localStorage.setItem("nox-presence", next);
    setPresenceMenuOpen(false);
    if (profile) setProfile({ ...profile, presence_status: next });
    if (supabase && user) {
      const { error } = await supabase.from("profiles").update({ presence_status: next }).eq("id", user.id);
      if (error) showNotice(`Не удалось сохранить статус. Примени supabase/nox-upgrade.sql: ${error.message}`);
    }
  }

  function openProfilePopover(event: ReactMouseEvent<HTMLButtonElement>) {
    if (!user || !supabase) {
      setAuthMode("signin");
      setShowAuth(true);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 20);
    setProfilePopoverAnchor({
      left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)),
      bottom: Math.max(12, window.innerHeight - rect.top + 8)
    });
    setProfilePopoverOpen((open) => !open);
  }

  async function openMemberCard(event: ReactMouseEvent<HTMLElement>, target: Profile | null | undefined, own = false) {
    event.stopPropagation();
    const person = own ? profile : target;
    if (!person) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const width = Math.min(320, window.innerWidth - 20);
    setMemberCardAnchor({ left: Math.max(10, Math.min(rect.left, window.innerWidth - width - 10)), bottom: Math.max(12, window.innerHeight - rect.top + 8) });
    setMemberCardIsOwn(own || (!!user && person.id === user.id));
    setMemberCardProfile(person);
    if (supabase && person.id && (!person.bio && !person.presence_status)) {
      const { data } = await supabase.from("profiles").select("id, username, display_name, avatar_url, presence_status, bio, nitro_expires_at, nitro_banner_url, nitro_frame, nitro_accent_color").eq("id", person.id).maybeSingle();
      if (data) setMemberCardProfile(data as Profile);
    }
  }

  function closeMemberCard() { setMemberCardProfile(null); setMemberCardAnchor(null); }

  function openProfileSettings() {
    if (!user || !supabase) {
      setAuthMode("signin");
      setShowAuth(true);
      return;
    }
    setProfileUsernameDraft(profile?.username || "");
    setProfileNameDraft(profile?.display_name || profile?.username || "");
    setProfileBioDraft(profile?.bio || "");
    setNitroBannerDraft(profile?.nitro_banner_url || "");
    setNitroFrameDraft(profile?.nitro_frame || "none");
    setNitroAccentDraft(profile?.nitro_accent_color || "#8b75ff");
    setNitroAvatarBgDraft(profile?.nitro_avatar_bg || "#29243b");
    setProfilePopoverOpen(false);
    setProfileSettingsOpen(true);
    setPresenceMenuOpen(false);
  }

  async function saveProfileSettings(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !user) return;
    const username = profileUsernameDraft.trim().replace(/^@/, "").toLowerCase();
    const displayName = profileNameDraft.trim().slice(0, 32);
    const bio = profileBioDraft.trim().slice(0, 190);
    if (!/^[a-z0-9_]{2,32}$/.test(username)) { showNotice("Ник должен содержать 2–32 символа: латинские буквы, цифры или _."); return; }
    if (!displayName) { showNotice("Укажи отображаемое имя."); return; }
    setProfileSaving(true);
    const { data, error } = await supabase.from("profiles")
      .update({ username, display_name: displayName, bio, ...(profile?.nitro_expires_at && new Date(profile.nitro_expires_at).getTime() > Date.now() ? { nitro_banner_url: nitroBannerDraft.trim() || null, nitro_frame: nitroFrameDraft, nitro_accent_color: nitroAccentDraft, nitro_avatar_bg: nitroAvatarBgDraft } : {}) })
      .eq("id", user.id).select("*").single();
    setProfileSaving(false);
    if (error) {
      showNotice(error.code === "23505" ? "Этот ник уже занят." : `Не удалось сохранить профиль. Примени supabase/nox-upgrade.sql: ${error.message}`);
      return;
    }
    setProfile(data as Profile);
    setProfileSettingsOpen(false);
    await Promise.all([loadDirectContacts(user.id), loadFriendRelations(user.id)]);
    showNotice("Профиль обновлён.");
  }

  async function saveServerSettings(e: FormEvent) {
    e.preventDefault();
    if (!activeSpace) return;
    const name = serverNameDraft.trim().slice(0, 48);
    if (!name) { showNotice("Введи название сервера."); return; }
    const remote = !!supabase && !!user && !activeSpace.id.startsWith("demo-") && !activeSpace.id.startsWith("local-");
    if (remote) {
      const { data, error } = await supabase!.from("servers").update({ name }).eq("id", activeSpace.id).select("id").maybeSingle();
      if (error || !data) { showNotice(error?.message || "Не удалось изменить сервер. Нужны права владельца."); return; }
    }
    setSpaces((old) => old.map((space) => space.id === activeSpace.id ? { ...space, name } : space));
    setServerSettingsOpen(false);
    showNotice("Настройки сервера сохранены.");
  }

  async function inviteFriendToServer(friend: FriendRelation) {
    if (!supabase || !user || !activeSpace || !canInviteFriends) return;
    setInvitingFriendId(friend.id);
    const { data, error } = await supabase.rpc("send_server_invite", {
      target_server_id: activeSpace.id,
      target_user_id: friend.id
    });
    setInvitingFriendId("");
    if (error) {
      showNotice(`Не удалось пригласить. Примени supabase/nox-upgrade.sql: ${error.message}`);
      return;
    }
    if (!data?.conversation_id) { showNotice("Не удалось создать личный чат для приглашения."); return; }
    const contact = { ...friend, conversationId: data.conversation_id } as DmContact;
    setDmContacts((old) => [contact, ...old.filter((item) => item.id !== friend.id)]);
    setActiveDm(friend.id);
    setActiveView("home");
    setActiveHomeTab("Сообщения");
    setSidebarOpen(false);
    setServerInviteOpen(false);
    setServerSettingsOpen(false);
    showNotice(`Приглашение в «${activeSpace.name}» отправлено в личку.`);
  }

  async function openServerFromInvite(message: Message) {
    const invitation = message.metadata;
    if (!supabase || !user || !invitation?.invite_id) return;
    const alreadyMember = spaces.some((space) => space.id === invitation.server_id);
    setAcceptingInviteId(invitation.invite_id);
    let serverId = invitation.server_id as string;
    if (!alreadyMember) {
      const { data, error } = await supabase.rpc("accept_server_invite", { target_invite_id: invitation.invite_id });
      if (error || !data) {
        setAcceptingInviteId("");
        showNotice(error?.message || "Не удалось принять приглашение.");
        return;
      }
      serverId = data as string;
      await loadSpaces(user.id);
    }
    const { data: firstChannel } = await supabase.from("channels").select("id").eq("server_id", serverId).order("created_at").limit(1).maybeSingle();
    setAcceptingInviteId("");
    setActiveDm("");
    setActiveView("server");
    setActiveSpaceId(serverId);
    setActiveChannelId(firstChannel?.id || "");
    setSidebarOpen(false);
    showNotice(`Открыт сервер «${invitation.server_name || "сервер"}».`);
  }

  async function deleteActiveServer() {
    if (!activeSpace || !canManageChannels) return;
    const serverToDelete = activeSpace;
    const remote = !!supabase && !!user && !serverToDelete.id.startsWith("demo-") && !serverToDelete.id.startsWith("local-");
    if (remote) {
      const { data, error } = await supabase!.from("servers").delete().eq("id", serverToDelete.id).select("id").maybeSingle();
      if (error || !data) {
        showNotice(error?.message || "Не удалось удалить сервер. Удалять сервер может только владелец.");
        return;
      }
    }
    const nextSpaces = spaces.filter((space) => space.id !== serverToDelete.id);
    const nextChannelsBySpace = { ...channelsBySpace };
    delete nextChannelsBySpace[serverToDelete.id];
    const nextSpace = nextSpaces[0];
    const nextChannel = nextSpace ? (nextChannelsBySpace[nextSpace.id] || [])[0] : undefined;
    setSpaces(nextSpaces);
    setChannelsBySpace(nextChannelsBySpace);
    setActiveSpaceId(nextSpace?.id || "");
    setActiveChannelId(nextChannel?.id || "");
    setMessages([]);
    setMembers([]);
    setActiveView(nextSpace ? "server" : "home");
    setSidebarOpen(window.matchMedia("(max-width: 760px)").matches && !!nextSpace);
    setDeleteServerOpen(false);
    setServerSettingsOpen(false);
    showNotice(`Сервер «${serverToDelete.name}» удалён.`);
  }

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
      setMessages(saved);
      return;
    }
    const { data, error } = await supabase.from("messages")
      .select("id, channel_id, user_id, content, created_at, profiles(id, username, display_name, avatar_url, bio)")
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
        setShowAuth(false);
        setActiveView("home");
        setSidebarOpen(window.matchMedia("(max-width: 760px)").matches);
        setActiveDm("");
        await loadProfile(current);
        await loadSpaces(current.id);
        await loadDirectContacts(current.id);
      } else {
        setShowAuth(true);
        setSpaces([]); setChannelsBySpace({}); setActiveSpaceId(""); setActiveChannelId(""); setMessages([]);
        setDmContacts([]); setActiveDm(""); setActiveView("home");
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const current = session?.user || null;
      setUser(current);
      if (!current) {
        setProfile(null); setShowAuth(true); setAuthMode("signup");
        setSpaces([]); setChannelsBySpace({}); setActiveSpaceId(""); setActiveChannelId(""); setMessages([]);
        setDmContacts([]); setActiveDm(""); setActiveView("home");
      }
      else {
        setShowAuth(false);
        setActiveView("home");
        setSidebarOpen(window.matchMedia("(max-width: 760px)").matches);
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

  useEffect(() => {
    if (!supabase || !user) return;
    const channel = supabase.channel(`server-invites:${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "server_members", filter: `user_id=eq.${user.id}`
      }, async () => {
        await loadSpaces(user.id);
        showNotice("Тебя добавили на сервер.");
      }).subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [user, loadSpaces, showNotice]);

  useEffect(() => {
    if (!supabase || !user) return;
    const channel = supabase.channel(`new-direct-chats:${user.id}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "direct_conversation_members", filter: `user_id=eq.${user.id}`
      }, async () => { await loadDirectContacts(user.id); })
      .subscribe();
    return () => { void supabase!.removeChannel(channel); };
  }, [user, loadDirectContacts]);

  useEffect(() => {
    if (user) void loadFriendRelations(user.id);
    else setFriendRelations([]);
  }, [user, loadFriendRelations]);

  useEffect(() => { loadMessages(activeChannelId); }, [activeChannelId, loadMessages]);

  useEffect(() => {
    const until = slowmodeUntil[activeChannelId] || 0;
    if (!until || until <= Date.now()) { setSlowmodeRemaining(0); return; }
    let timer = 0;
    const updateRemaining = () => {
      const remaining = Math.max(0, Math.ceil((until - Date.now()) / 1000));
      setSlowmodeRemaining((current) => current === remaining ? current : remaining);
      if (remaining === 0 && timer) window.clearInterval(timer);
    };
    updateRemaining();
    timer = window.setInterval(updateRemaining, 250);
    return () => window.clearInterval(timer);
  }, [activeChannelId, slowmodeUntil]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (!searchOpen || !supabase || !user || query.length < 2) { setPeopleResults([]); setPeopleLoading(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPeopleLoading(true);
      const [byUsername, byName] = await Promise.all([
        supabase!.from("profiles").select("id, username, display_name, avatar_url, presence_status, bio").neq("id", user.id).ilike("username", `%${query}%`).limit(20),
        supabase!.from("profiles").select("id, username, display_name, avatar_url, presence_status, bio").neq("id", user.id).ilike("display_name", `%${query}%`).limit(20)
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
        .select("id, conversation_id, user_id, content, message_type, metadata, created_at, profiles(id, username, display_name, avatar_url, presence_status, bio)")
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
        const { data: person } = await supabase!.from("profiles").select("id, username, display_name, avatar_url, presence_status, bio").eq("id", row.user_id).maybeSingle();
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
    if (!supabase || !user || !dmContacts.length) return;
    const channels = dmContacts
      .filter((contact) => contact.conversationId && !(activeView === "home" && contact.conversationId === activeDmContact?.conversationId))
      .map((contact) => {
        const conversationId = contact.conversationId!;
        return supabase!.channel(`dm-notify:${user.id}:${conversationId}`)
          .on("postgres_changes", {
            event: "INSERT", schema: "public", table: "direct_messages",
            filter: `conversation_id=eq.${conversationId}`
          }, async (payload) => {
            const row = payload.new as any;
            if (row.user_id === user.id) return;
            const { data: person } = await supabase!.from("profiles")
              .select("id, username, display_name, avatar_url, presence_status, bio").eq("id", row.user_id).maybeSingle();
            const message = { ...row, channel_id: conversationId, profile: person as Profile | undefined } as Message;
            setDmMessages((old) => ({
              ...old,
              [conversationId]: (old[conversationId] || []).some((item) => item.id === message.id)
                ? old[conversationId] : [...(old[conversationId] || []), message]
            }));
            setUnreadDms((old) => ({ ...old, [contact.id]: (old[contact.id] || 0) + 1 }));
            if (row.metadata?.reply_to_user_id === user.id) showNotice(`${person?.display_name || person?.username || "Пользователь"} ответил на твоё сообщение.`);
          })
          .subscribe();
      });
    return () => { channels.forEach((channel) => void supabase!.removeChannel(channel)); };
  }, [dmContacts, activeDmContact?.conversationId, activeView, user]);

  useEffect(() => {
    if (!activeDmContact) return;
    setUnreadDms((old) => {
      if (!old[activeDmContact.id]) return old;
      const next = { ...old };
      delete next[activeDmContact.id];
      return next;
    });
  }, [activeDmContact?.id, activeDmContact?.conversationId]);

  useEffect(() => {
    if (!supabase || !user) return;
    const channel = supabase.channel(`profile-presence:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload) => {
        const updated = payload.new as Profile;
        if (!updated?.id) return;
        if (updated.id === user.id) { setProfile((old) => old ? { ...old, ...updated } : updated); if (updated.presence_status) setPresence(updated.presence_status); }
        setDmContacts((old) => old.map((person) => person.id === updated.id ? { ...person, ...updated } : person));
        setFriendRelations((old) => old.map((person) => person.id === updated.id ? { ...person, ...updated } : person));
        setPeopleResults((old) => old.map((person) => person.id === updated.id ? { ...person, ...updated } : person));
        setMembers((old) => old.map((person) => person.id === updated.id ? { ...person, ...updated } : person));
        setDmMessages((old) => Object.fromEntries(Object.entries(old).map(([key, rows]) => [key, rows.map((message) => message.profile?.id === updated.id ? { ...message, profile: { ...message.profile, ...updated } } : message)])));
      }).subscribe();
    const serverChannel = supabase.channel(`server-settings:${user.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "servers" }, (payload) => {
        const updated = payload.new as { id: string; name: string };
        if (updated?.id && updated.name) setSpaces((old) => old.map((space) => space.id === updated.id ? { ...space, name: updated.name } : space));
      }).subscribe();
    return () => { void supabase!.removeChannel(channel); void supabase!.removeChannel(serverChannel); };
  }, [user]);

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
        if (row.metadata?.reply_to_user_id === user?.id) showNotice(`${p?.display_name || p?.username || "Пользователь"} ответил на твоё сообщение.`);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const old = payload.old as any;
        if (!old?.id) return;
        setMessages((oldMessages) => oldMessages.filter((message) => message.id !== old.id));
      }).subscribe();
    return () => { supabase!.removeChannel(channel); };
  }, [activeChannelId]);

  useEffect(() => {
    if (!supabase || !user) return;
    const tracked = Object.values(channelsBySpace).flat().filter((channel) =>
      channel.id !== activeChannelId && !channel.id.startsWith("demo-") && !channel.id.startsWith("local-")
    );
    if (!tracked.length) return;
    const subscription = supabase.channel(`unread-channels:${user.id}`);
    tracked.forEach((channel) => {
      subscription.on("postgres_changes", {
        event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channel.id}`
      }, (payload) => {
        const row = payload.new as Message;
        if (row.user_id === user.id) return;
        setUnreadChannels((old) => ({ ...old, [channel.id]: (old[channel.id] || 0) + 1 }));
      });
    });
    subscription.subscribe();
    return () => { void supabase!.removeChannel(subscription); };
  }, [channelsBySpace, activeChannelId, user]);

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
    setChannelMenuOpen(false);
    setChannelMenuFor("");
    setActiveDm("");
    setActiveSpaceId(space.id);
    const next = channelsBySpace[space.id] || [];
    setActiveChannelId(next[0]?.id || "");
    setSidebarOpen(false);
  };
  const chooseChannel = (channel: Channel) => {
    setChannelMenuOpen(false);
    setChannelMenuFor("");
    setUnreadChannels((old) => { if (!old[channel.id]) return old; const next = { ...old }; delete next[channel.id]; return next; });
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
          setSidebarOpen(window.matchMedia("(max-width: 760px)").matches);
          setActiveView("home");
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
        setActiveView("home");
        setSidebarOpen(window.matchMedia("(max-width: 760px)").matches);
        await loadProfile(data.user);
        await loadSpaces(data.user.id);
        await loadDirectContacts(data.user.id);
        setShowAuth(false);
        showNotice("Ты снова в Nox.");
      }
    } catch (err: any) {
      setAuthError(err.message || "Не удалось выполнить вход.");
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut();
    setUser(null); setProfile(null); setShowAuth(true); setAuthMode("signup");
    setSpaces([]); setChannelsBySpace({}); setDmContacts([]); setActiveDm(""); setMessages([]);
    setActiveSpaceId(""); setActiveChannelId(""); setActiveView("home");
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
        showNotice(`Не удалось открыть чат.${reason} Примени supabase/nox-upgrade.sql в SQL Editor Supabase.`);
        return;
      }
      conversationId = data as string;
    }
    const contact = { ...person, conversationId } as DmContact;
    setDmContacts((old) => [contact, ...old.filter((item) => item.id !== person.id)]);
    setActiveDm(person.id); setActiveView("home"); setActiveHomeTab("Сообщения"); setSearchOpen(false); setSidebarOpen(false);
  }

  async function addFriend(person: Profile) {
    if (!supabase || !user) {
      setAuthMode("signin"); setShowAuth(true);
      showNotice("Войди в аккаунт, чтобы добавлять друзей.");
      return;
    }
    const { data, error } = await supabase.rpc("send_friend_request", { target_user_id: person.id });
    if (error) {
      showNotice(`Не удалось добавить в друзья. Примени supabase/nox-upgrade.sql. ${error.message}`);
      return;
    }
    const result = data as string;
    showNotice(result === "already_friends" ? "Вы уже друзья." : result === "accepted" ? "Заявка встречная — теперь вы друзья!" : "Заявка в друзья отправлена.");
    await loadFriendRelations(user.id);
  }

  async function respondToFriendRequest(relation: FriendRelation, accept: boolean) {
    if (!supabase || !user) return;
    const { data, error } = await supabase.rpc("respond_to_friend_request", {
      target_request_id: relation.requestId,
      should_accept: accept
    });
    if (error || !data) {
      showNotice(error?.message || "Заявка уже обработана.");
      return;
    }
    showNotice(accept ? `Теперь вы с ${relation.display_name || relation.username} друзья.` : "Заявка отклонена.");
    await loadFriendRelations(user.id);
  }

  async function uploadAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!supabase || !user) {
      setAuthMode("signin"); setShowAuth(true);
      showNotice("Войди в аккаунт, чтобы установить общий аватар.");
      return;
    }
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type) || file.size > 5 * 1024 * 1024) {
      showNotice("Выбери JPG, PNG или WebP размером до 5 МБ. GIF-аватарки больше не поддерживаются.");
      return;
    }
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = `${user.id}/avatar.${extension}`;
    setAvatarBusy(true);
    try {
      const { error: uploadError } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true, contentType: file.type, cacheControl: "3600"
      });
      if (uploadError) throw uploadError;
      const publicUrl = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
      const { data, error } = await supabase.from("profiles").update({ avatar_url: publicUrl }).eq("id", user.id).select("*").single();
      if (error) throw error;
      setProfile(data as Profile);
      await Promise.all([loadDirectContacts(user.id), loadFriendRelations(user.id)]);
      showNotice("Аватар обновлён — его увидят остальные.");
    } catch (error: any) {
      showNotice(`Не удалось загрузить аватар. Примени supabase/nox-upgrade.sql. ${error?.message || ""}`);
    } finally {
      setAvatarBusy(false);
    }
  }

  function openAvatarPicker() {
    if (!supabase || !user) {
      setAuthMode("signin"); setShowAuth(true);
      return;
    }
    if (!avatarBusy) avatarInputRef.current?.click();
  }

  async function sendGif(url: string, direct: boolean) {
    if (!/^https:\/\//i.test(url)) return;
    const content = `GIF:${url}`;
    if (direct) {
      if (!activeDm || !activeDmContact) return;
      if (supabase && user && activeDmContact.conversationId) {
        const { error } = await supabase.from("direct_messages").insert({ conversation_id: activeDmContact.conversationId, user_id: user.id, content });
        if (error) { showNotice("GIF не отправилась. Проверь доступ к личному чату."); return; }
      } else {
        const item: Message = { id: crypto.randomUUID(), channel_id: `dm-${activeDm}`, user_id: "you", content, created_at: new Date().toISOString(), profile: { id: "you", username: "you", display_name: currentName } };
        setDmMessages((old) => { const next = { ...old, [activeDmKey]: [...(old[activeDmKey] || []), item] }; localStorage.setItem(`nox-dm-${activeDmKey}`, JSON.stringify(next[activeDmKey])); return next; });
      }
    } else {
      if (!activeChannel) return;
      if (supabase && !activeChannel.id.startsWith("demo-") && !activeChannel.id.startsWith("local-") && user) {
        const { error } = await supabase.from("messages").insert({ channel_id: activeChannel.id, user_id: user.id, content });
        if (error) { showNotice("GIF не отправилась. Проверь доступ к каналу."); return; }
      } else {
        const item: Message = { id: crypto.randomUUID(), channel_id: activeChannel.id, user_id: "you", content, created_at: new Date().toISOString(), profile: { id: "you", username: "you", display_name: currentName } };
        setMessages((old) => { const next = [...old, item]; localStorage.setItem(`nox-messages-${activeChannel.id}`, JSON.stringify(next)); return next; });
      }
    }
    setGifPickerFor(null); setGifQuery(""); setGifResults([]);
  }

  async function sendDm(e: FormEvent) {
    e.preventDefault();
    const content = dmDraft.trim();
    if (!content || !activeDm || !activeDmContact) return;
    if (supabase && user && activeDmContact.conversationId) {
      const { error } = await supabase.from("direct_messages").insert({
        conversation_id: activeDmContact.conversationId, user_id: user.id, content,
        ...(replyTarget?.direct ? { metadata: { reply_to: replyTarget.id, reply_to_user_id: replyTarget.userId, reply_author: replyTarget.author, reply_content: replyTarget.content } } : {})
      });
      if (error) { console.error("Nox direct message insert failed:", error); showNotice(`Ошибка отправки: ${error.message}`); return; }
      setDmDraft(""); setReplyTarget(null);
      return;
    }
    const item: Message = {
      id: crypto.randomUUID(), channel_id: `dm-${activeDm}`, user_id: "you", content,
      created_at: new Date().toISOString(), profile: { id: "you", username: "you", display_name: currentName },
      metadata: replyTarget?.direct ? { reply_to: replyTarget.id, reply_to_user_id: replyTarget.userId, reply_author: replyTarget.author, reply_content: replyTarget.content } : null
    };
    setDmMessages((old) => {
      const next = { ...old, [activeDmKey]: [...(old[activeDmKey] || []), item] };
      localStorage.setItem(`nox-dm-${activeDmKey}`, JSON.stringify(next[activeDmKey]));
      return next;
    });
    setDmDraft(""); setReplyTarget(null);
  }

  async function sendMessage(e: FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !activeChannel) return;
    const waitSeconds = Math.max(0, Math.ceil(((slowmodeUntil[activeChannel.id] || 0) - Date.now()) / 1000));
    if (waitSeconds > 0) {
      setSlowmodeRemaining(waitSeconds);
      return;
    }
    const cooldown = activeChannel.slowmode_seconds || 0;
    if (!supabase || activeChannel.id.startsWith("demo-") || activeChannel.id.startsWith("local-") || !user) {
      const local: Message = {
        id: crypto.randomUUID(), channel_id: activeChannel.id, user_id: "you",
        content, created_at: new Date().toISOString(),
        profile: { id: "you", username: "you", display_name: "Ты" },
        metadata: replyTarget && !replyTarget.direct ? { reply_to: replyTarget.id, reply_to_user_id: replyTarget.userId, reply_author: replyTarget.author, reply_content: replyTarget.content } : null
      };
      setMessages((old) => [...old, local]);
      const next = [...messages, local];
      localStorage.setItem(`nox-messages-${activeChannel.id}`, JSON.stringify(next));
      if (cooldown > 0) setSlowmodeUntil((old) => ({ ...old, [activeChannel.id]: Date.now() + cooldown * 1000 }));
      setDraft(""); setReplyTarget(null);
      return;
    }
    const { error } = await supabase.from("messages").insert({
      channel_id: activeChannel.id, user_id: user.id, content,
      ...(replyTarget && !replyTarget.direct ? { metadata: { reply_to: replyTarget.id, reply_to_user_id: replyTarget.userId, reply_author: replyTarget.author, reply_content: replyTarget.content } } : {})
    });
    if (error) {
      const slowmode = error.message.match(/SLOWMODE:(\d+)/);
      if (slowmode) {
        const seconds = Number(slowmode[1]);
        setSlowmodeUntil((old) => ({ ...old, [activeChannel.id]: Date.now() + seconds * 1000 }));
        setSlowmodeRemaining(seconds);
        showNotice(`Медленный режим: подожди ${seconds} сек.`);
      } else showNotice(error.message || "Сообщение не отправлено. Возможно, у тебя нет доступа к каналу.");
      return;
    }
    if (cooldown > 0) setSlowmodeUntil((old) => ({ ...old, [activeChannel.id]: Date.now() + cooldown * 1000 }));
    setDraft(""); setReplyTarget(null);
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
        showNotice(error?.message ? `Не удалось удалить. Примени supabase/nox-upgrade.sql: ${error.message}` : "Не удалось удалить сообщение.");
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

  async function saveChannelSettings(e: FormEvent) {
    e.preventDefault();
    if (!activeChannel || !activeSpace) return;
    const seconds = Number(slowmodeDraft);
    if (!Number.isInteger(seconds) || seconds < 0 || seconds > 21600) {
      showNotice("Укажи целое число от 0 до 21600 секунд.");
      return;
    }
    const isRemoteChannel = !!supabase && !!user && !activeChannel.id.startsWith("demo-") && !activeChannel.id.startsWith("local-");
    if (isRemoteChannel) {
      const { data, error } = await supabase!.from("channels").update({ slowmode_seconds: seconds }).eq("id", activeChannel.id).select("*").maybeSingle();
      if (error || !data) {
        showNotice(error?.message ? `Не удалось сохранить настройки. Примени supabase/nox-upgrade.sql: ${error.message}` : "Не удалось сохранить настройки.");
        return;
      }
    }
    setChannelsBySpace((old) => ({
      ...old,
      [activeSpace.id]: (old[activeSpace.id] || []).map((channel) => channel.id === activeChannel.id ? { ...channel, slowmode_seconds: seconds } : channel)
    }));
    setChannelSettingsOpen(false);
    showNotice(seconds ? `Медленный режим: одно сообщение раз в ${seconds} сек.` : "Медленный режим выключен.");
  }

  async function deleteActiveChannel() {
    if (!activeChannel || !activeSpace) return;
    const isRemoteChannel = !!supabase && !!user && !activeChannel.id.startsWith("demo-") && !activeChannel.id.startsWith("local-");
    if (isRemoteChannel) {
      const { data, error } = await supabase!.from("channels").delete().eq("id", activeChannel.id).select("id").maybeSingle();
      if (error || !data) {
        showNotice(error?.message ? `Не удалось удалить канал. Проверь права владельца и supabase/nox-upgrade.sql: ${error.message}` : "Не удалось удалить канал.");
        return;
      }
    }
    const nextChannels = (channelsBySpace[activeSpace.id] || []).filter((channel) => channel.id !== activeChannel.id);
    setChannelsBySpace((old) => ({ ...old, [activeSpace.id]: nextChannels }));
    setActiveChannelId(nextChannels[0]?.id || "");
    setMessages([]);
    setDeleteChannelOpen(false);
    setChannelMenuOpen(false);
    showNotice(`Канал #${activeChannel.name} удалён.`);
  }

  const visibleMessages = useMemo(() => messages, [messages]);

  useEffect(() => {
    const container = activeDm ? dmScrollRef.current : channelScrollRef.current;
    if (!container) return;
    const frame = window.requestAnimationFrame(() => {
      container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeDm, activeDmKey, activeChannelId, dmMessages, visibleMessages.length]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLocaleLowerCase();
    if (!q) return [];
    const all = [...messages];
    return all.filter((m, i) => all.findIndex((x) => x.id === m.id) === i && m.content.toLocaleLowerCase().includes(q)).slice(0, 20);
  }, [messages, searchQuery]);
  const currentName = profile?.display_name || profile?.username || user?.email?.split("@")[0] || "Профиль";
  const acceptedFriends = friendRelations.filter((relation) => relation.status === "accepted");
  const incomingFriendRequests = friendRelations.filter((relation) => relation.status === "pending" && relation.addresseeId === user?.id);
  const outgoingFriendRequests = friendRelations.filter((relation) => relation.status === "pending" && relation.requesterId === user?.id);
  const homeActionLabel = activeHomeTab === "Друзья"
    ? "Найти друзей"
    : ["Сообщения", "Найти беседу", "Новая беседа"].includes(activeHomeTab)
      ? "Новая беседа"
      : "";
  const totalUnreadDms = Object.values(unreadDms).reduce((sum, count) => sum + count, 0);

  return (
    <div className={`app-shell ${activeView === "home" ? "home-shell" : ""} ${!membersOpen ? "members-hidden" : ""}`}>
      {pullRefreshDistance > 0 && <div className="pull-refresh-indicator" style={{ top: `calc(env(safe-area-inset-top) + ${Math.min(pullRefreshDistance, 96)}px)` }}>
        <span className="pull-refresh-spinner" />{pullRefreshDistance >= 82 ? "Отпусти, чтобы обновить" : "Потяни вниз для обновления"}
      </div>}
      <aside className={`server-rail ${sidebarOpen ? "rail-open" : ""}`}>
        <button className={`brand-mark ${activeView === "home" ? "brand-active" : ""} ${totalUnreadDms ? "has-notifications" : ""}`} title={totalUnreadDms ? `Главная — ${totalUnreadDms} непрочитанных личных сообщений` : "Главная"} onClick={() => {
          const isMobile = window.matchMedia("(max-width: 760px)").matches;
          if (isMobile && activeView === "home") {
            if (activeDm || activeHomeTab !== "Сообщения") { setActiveHomeTab("Сообщения"); setActiveDm(""); setSidebarOpen(true); }
            else setSidebarOpen((open) => !open);
            return;
          }
          setActiveView("home"); setActiveHomeTab("Сообщения"); setActiveDm("");
          setSidebarOpen(isMobile);
        }}>
          <span className="brand-glyph">n</span>{totalUnreadDms > 0 && <b className="rail-unread">{totalUnreadDms > 99 ? "99+" : totalUnreadDms}</b>}
        </button>
        <div className="rail-separator" />
        {spaces.map((space) => {
          const unreadCount = (channelsBySpace[space.id] || []).reduce((sum, channel) => sum + (unreadChannels[channel.id] || 0), 0);
          return <button key={space.id} className={`server-icon ${activeView === "server" && activeSpaceId === space.id ? "selected" : ""} ${unreadCount ? "has-notifications" : ""}`} title={unreadCount ? `${space.name} — ${unreadCount} непрочитанных` : space.name} onClick={() => {
            const isCurrentSpace = activeView === "server" && activeSpaceId === space.id;
            const isMobile = window.matchMedia("(max-width: 760px)").matches;
            if (isCurrentSpace && isMobile) setSidebarOpen((open) => !open);
            else {
              setActiveView("server"); chooseSpace(space);
              if (isMobile) setSidebarOpen(true);
            }
          }}>
            <span>{initials(space.name)}</span>{unreadCount > 0 && <b className="server-unread">{unreadCount > 99 ? "99+" : unreadCount}</b>}
            <i />
          </button>
        })}
        <button className="server-icon add-server" title="Создать сервер" onClick={() => setCreateSpaceOpen(true)}><Plus size={22} /></button>
        <button className="server-icon explore" title="Обзор сообществ" onClick={() => showNotice("Обзор сообществ: здесь появятся открытые серверы.")}><Compass size={20} /></button>
        <div className="rail-bottom">
          <button className="tiny-icon" title="Редактировать профиль" onClick={openProfileSettings}><Settings size={19} /></button>
        </div>
      </aside>

      {activeView === "home" ? <aside className={`channel-sidebar home-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <button className="home-search" onClick={() => setSearchOpen(true)}><Search size={17}/><span>Найти или начать беседу</span></button>
        <nav className="home-nav">
          {[{label:"Друзья", icon:<UserRound size={19}/>},{label:"Nitro", icon:<Sparkles size={19}/>},{label:"Магазин", icon:<Store size={19}/>}].map((item) => <button key={item.label} className={`home-nav-item ${activeHomeTab === item.label ? "active" : ""}`} onClick={() => { setActiveHomeTab(item.label); setActiveDm(""); setSidebarOpen(false); if (item.label === "Друзья" && user) void loadFriendRelations(user.id); }}>{item.icon}<span>{item.label}</span>{item.label === "Nitro" ? <small>ПРЕДЛОЖЕНИЕ</small> : item.label === "Друзья" && incomingFriendRequests.length > 0 ? <small>{incomingFriendRequests.length}</small> : null}</button>)}
        </nav>
        <div className="dm-heading"><span>ЛИЧНЫЕ СООБЩЕНИЯ</span><button title="Новая беседа" onClick={() => setSearchOpen(true)}><Plus size={18}/></button></div>
        <div className="dm-list">
          {dmContacts.map((person) => { const name = person.display_name || person.username; const unread = unreadDms[person.id] || 0; return <button key={person.id} className={`dm-item ${activeDm === person.id ? "active" : ""} ${unread ? "has-unread" : ""}`} onClick={() => { setActiveDm(person.id); setUnreadDms((old) => { const next = { ...old }; delete next[person.id]; return next; }); setActiveHomeTab("Сообщения"); setSidebarOpen(false); }}><ProfileAvatar profile={person} name={name} className="dm-avatar" /><span className="dm-name">{name}</span>{unread ? <b className="dm-unread">{unread > 99 ? "99+" : unread}</b> : <i/>}</button>; })}
          {!dmContacts.length && <p className="empty-small">Пока нет личных чатов.</p>}
        </div>
        <div className="profile-bar">
          <button type="button" className="profile-avatar-button" title="Открыть профиль" onClick={openProfilePopover}><ProfileAvatar profile={{ ...(profile || { id: "profile", username: "profile", display_name: currentName }), presence_status: presence }} name={currentName} className="avatar self-avatar" /></button><div className="profile-copy"><strong>{currentName}</strong><div className="presence-menu-wrap"><button className={`presence-trigger status-${presence}`} onClick={() => setPresenceMenuOpen((open) => !open)}><i className={`presence-dot status-${presence}`}/>{presenceLabel(presence)}</button>{presenceMenuOpen && <div className="presence-menu">{presenceOptions.map((option) => <button key={option.value} className={presence === option.value ? "selected" : ""} onClick={() => void choosePresence(option.value)}><i className={`presence-dot status-${option.value}`}/><span><strong>{option.label}</strong><small>{option.hint}</small></span></button>)}</div>}</div></div>
          <button className="profile-action" title={user ? "Выйти" : "Войти"} onClick={() => user ? signOut() : (setAuthMode("signup"), setShowAuth(true))}>{user ? <LogOut size={17}/> : <Settings size={17}/>}</button>
          <button className={`profile-action ${muted ? "control-active" : ""}`} title={muted ? "Включить микрофон" : "Выключить микрофон"} onClick={() => { setMuted(!muted); showNotice(muted ? "Микрофон включён" : "Микрофон выключен"); }}><Mic size={17}/></button><button className={`profile-action ${deafened ? "control-active" : ""}`} title={deafened ? "Включить звук" : "Выключить звук"} onClick={() => { setDeafened(!deafened); showNotice(deafened ? "Звук включён" : "Звук выключен"); }}><Headphones size={17}/></button>
        </div>
      </aside> : <aside className={`channel-sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
        <div className="space-heading-wrap">
          <button className="space-heading" onClick={() => setChannelMenuOpen((open) => !open)} title="Настройки сервера и каналов" aria-expanded={channelMenuOpen}>
            <span>{activeSpace?.name || "Твои серверы"}</span><ChevronDown size={17} />
          </button>
          {channelMenuOpen && <div className="space-actions-menu">
            {canManageChannels && <>
              <button onClick={() => { setServerNameDraft(activeSpace?.name || ""); setServerSettingsOpen(true); setChannelMenuOpen(false); }}><Settings size={16}/> Настройки сервера</button>
              <button onClick={() => { setCreateChannelOpen(true); setChannelMenuOpen(false); }}><Plus size={16}/> Создать канал</button>
            </>}
            {canInviteFriends && <button onClick={() => { setServerInviteOpen(true); setChannelMenuOpen(false); }}><UserPlus size={16}/> Пригласить друзей</button>}
            {!canManageChannels && !canInviteFriends && <p>Участники сервера могут приглашать друзей.</p>}
          </div>}
        </div>
        <div className="sidebar-scroll">
          <div className="section-heading"><span>ТЕКСТОВЫЕ КАНАЛЫ</span><button title="Создать канал" onClick={() => setCreateChannelOpen(true)}><Plus size={16}/></button></div>
          {channels.length ? channels.map((channel) => (
            <div key={channel.id} className={`channel-row ${channelMenuFor === channel.id ? "menu-open" : ""}`}>
              <button className={`channel-item ${activeChannelId === channel.id ? "active" : ""} ${unreadChannels[channel.id] ? "has-unread" : ""}`} onClick={() => chooseChannel(channel)}><Hash size={18}/><span>{channel.name}</span>{unreadChannels[channel.id] ? <b className="channel-unread">{unreadChannels[channel.id] > 99 ? "99+" : unreadChannels[channel.id]}</b> : null}</button>
              {canManageChannels && <button className="channel-settings-button" title={`Настройки #${channel.name}`} onClick={() => setChannelMenuFor((old) => old === channel.id ? "" : channel.id)}><Settings size={15}/></button>}
              {channelMenuFor === channel.id && <div className="channel-context-menu"><button onClick={() => { chooseChannel(channel); setSlowmodeDraft(String(channel.slowmode_seconds || 0)); setChannelSettingsOpen(true); setChannelMenuFor(""); setSidebarOpen(false); }}><Settings size={15}/> Настройки канала</button><button className="danger" onClick={() => { chooseChannel(channel); setDeleteChannelOpen(true); setChannelMenuFor(""); setSidebarOpen(false); }}><Trash2 size={15}/> Удалить канал</button></div>}
            </div>
          )) : <p className="empty-small">Пока нет каналов.</p>}

        </div>
        <div className="profile-bar">
          <button type="button" className="profile-avatar-button" title="Открыть профиль" onClick={openProfilePopover}><ProfileAvatar profile={{ ...(profile || { id: "profile", username: "profile", display_name: currentName }), presence_status: presence }} name={currentName} className="avatar self-avatar" /></button>
          <div className="profile-copy"><strong>{currentName}</strong><div className="presence-menu-wrap"><button className={`presence-trigger status-${presence}`} onClick={() => setPresenceMenuOpen((open) => !open)}><i className={`presence-dot status-${presence}`}/>{presenceLabel(presence)}</button>{presenceMenuOpen && <div className="presence-menu">{presenceOptions.map((option) => <button key={option.value} className={presence === option.value ? "selected" : ""} onClick={() => void choosePresence(option.value)}><i className={`presence-dot status-${option.value}`}/><span><strong>{option.label}</strong><small>{option.hint}</small></span></button>)}</div>}</div></div>
          <button className="profile-action" title={user ? "Выйти" : "Войти"} onClick={() => user ? signOut() : (setAuthMode("signup"), setShowAuth(true))}>
            {user ? <LogOut size={17}/> : <Settings size={17}/>}
          </button>
          <button className={`profile-action ${muted ? "control-active" : ""}`} title={muted ? "Включить микрофон" : "Выключить микрофон"} onClick={() => { setMuted(!muted); showNotice(muted ? "Микрофон включён" : "Микрофон выключен"); }}><Mic size={17}/></button>
          <button className={`profile-action ${deafened ? "control-active" : ""}`} title={deafened ? "Включить звук" : "Выключить звук"} onClick={() => { setDeafened(!deafened); showNotice(deafened ? "Звук включён" : "Звук выключен"); }}><Headphones size={17}/></button>
        </div>
      </aside>}

      {activeView === "home" ? <main className="chat-area home-area">
        <header className="chat-header home-header">{(activeDm || activeHomeTab !== "Сообщения") && <button className="mobile-sidebar-button" title="Назад к беседам" onClick={() => { setActiveDm(""); setActiveHomeTab("Сообщения"); setSidebarOpen(true); }}><ArrowLeft size={19}/></button>}<strong>{activeDmContact ? (activeDmContact.display_name || activeDmContact.username) : activeHomeTab}</strong><div className="header-divider"/><span className="header-topic">Nox — место для твоих разговоров</span><div className="header-actions"><button title="Поиск" onClick={() => setSearchOpen(true)}><Search size={19}/></button><button title="Новая беседа" onClick={() => setSearchOpen(true)}><CirclePlus size={19}/></button></div></header>
        {activeDm ? <>
          <div className="dm-conversation dm-chat" ref={dmScrollRef}>
            <ProfileAvatar profile={activeDmContact} name={activeDmContact?.display_name || activeDmContact?.username || "N"} className="dm-conversation-avatar" />
            <h1>{activeDmContact?.display_name || activeDmContact?.username || "Личные сообщения"}</h1>
            <p>Начало вашей переписки.</p>
            {(dmMessages[activeDmKey] || []).map((m) => {
              const isOwn = m.user_id === user?.id || m.user_id === "you";
              const sender = isOwn ? currentName : (m.profile?.display_name || m.profile?.username || activeDmContact?.display_name || "Пользователь");
              return <article className="message-row" key={m.id}>
                <button type="button" className="message-profile-trigger" aria-label={`Открыть профиль ${sender}`} onClick={(e) => void openMemberCard(e, isOwn ? profile : m.profile, isOwn)}><ProfileAvatar profile={isOwn ? profile : m.profile} name={sender} className={`avatar message-avatar ${isOwn ? "own" : ""}`} /></button>
                <div className="message-body">
                  <div className="message-meta"><button type="button" className="message-name-trigger" onClick={(e) => void openMemberCard(e, isOwn ? profile : m.profile, isOwn)}>{sender}</button><time>{timeLabel(m.created_at)}</time>
                    <div className="message-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" title="❤️" onClick={() => setMessageReactions(old => ({...old,[m.id]: old[m.id]?.includes("❤️") ? old[m.id].filter(x=>x!=="❤️") : [...(old[m.id]||[]),"❤️"]}))}>❤️</button>
                      <button type="button" title="💀" onClick={() => setMessageReactions(old => ({...old,[m.id]: old[m.id]?.includes("💀") ? old[m.id].filter(x=>x!=="💀") : [...(old[m.id]||[]),"💀"]}))}>💀</button>
                      <button type="button" title="Ответить" onClick={() => {setReplyTarget({id:m.id,userId:m.user_id,author:sender,content:m.content,direct:true});setDmDraft("");}}><Reply size={15}/></button>
                      <button type="button" title="Копировать" onClick={() => void navigator.clipboard?.writeText(m.content.startsWith("GIF:") ? m.content.slice(4) : m.content)}><Forward size={15}/></button>
                      <button type="button" title="Ещё" onClick={() => setMessageMenuOpen(messageMenuOpen===m.id?null:m.id)}><MoreHorizontal size={16}/></button>
                      {messageMenuOpen===m.id && <div className="message-more-menu">{isOwn && <button type="button" onClick={() => {setMessageMenuOpen(null);void deleteMessage(m,true);}}><Trash2 size={14}/> Удалить сообщение</button>}<button type="button" onClick={() => {setMessageMenuOpen(null);void navigator.clipboard?.writeText(m.content);}}>Копировать текст</button></div>}
                    </div>
                  </div>
                  {m.metadata?.reply_to && <div className="message-reply-quote"><b>{m.metadata.reply_author || "Ответ"}</b><span>{m.metadata.reply_content || "Сообщение"}</span></div>}
                  {!!messageReactions[m.id]?.length && <div className="message-reaction-chips">{messageReactions[m.id].map(emoji=><span key={emoji}>{emoji}</span>)}</div>}
                  {m.message_type === "server_invite" && m.metadata?.server_id ? <div className="dm-server-invite-card">
                    <div className="dm-server-invite-cover"><span>{initials(m.metadata.server_name || "N")}</span></div>
                    <div className="dm-server-invite-content">
                      <small>ПРИГЛАШЕНИЕ НА СЕРВЕР</small>
                      <strong>{m.metadata.server_name || "Сервер Nox"}</strong>
                      <span className="dm-server-invite-stats"><i/> {Number(m.metadata.member_count || 1).toLocaleString("ru-RU")} участников</span>
                      <button type="button" disabled={acceptingInviteId === m.metadata.invite_id} onClick={() => void openServerFromInvite(m)}>
                        {acceptingInviteId === m.metadata.invite_id ? "Подключаем…" : "Перейти на сервер"}
                      </button>
                    </div>
                  </div> : <MessageContent content={m.content} />}
                </div>
              </article>;
            })}
          </div>
          <div className="composer-wrap">
            {gifPickerFor === "dm" && <div className="gif-picker"><div className="gif-picker-top"><strong>Поиск GIF</strong><button type="button" onClick={() => setGifPickerFor(null)} aria-label="Закрыть GIF"><X size={17}/></button></div><input className="gif-search" value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Найти GIF…" autoFocus/><div className="gif-results">{gifLoading ? <span className="gif-state">Загружаю GIF…</span> : gifError ? <span className="gif-state">{gifError}</span> : gifResults.map((gif) => { const url = gif.images?.original?.url || gif.images?.fixed_width?.url || gif.images?.fixed_width_small?.url; return url ? <button type="button" className="gif-result" key={gif.id} onClick={() => void sendGif(url, true)}><img src={gif.images?.fixed_width_small?.url || gif.images?.fixed_width?.url || url} alt={gif.title || "GIF"} loading="lazy"/></button> : null; })}</div><small className="gif-attribution">Powered by GIPHY</small></div>}
            {replyTarget?.direct && <div className="reply-composer-banner"><span>Ответ для <b>{replyTarget.author}</b>: {replyTarget.content.startsWith("GIF:") ? "[GIF]" : replyTarget.content}</span><button type="button" onClick={() => setReplyTarget(null)} aria-label="Отменить ответ"><X size={15}/></button></div>}
            <form className="composer" onSubmit={sendDm}><input value={dmDraft} onChange={(e) => setDmDraft(e.target.value)} placeholder={`Написать @${activeDmContact?.username || "пользователю"}`} aria-label="Личное сообщение"/><button type="button" className={`composer-tool gif-trigger ${gifPickerFor === "dm" ? "active" : ""}`} title="GIF" onClick={() => { setGifPickerFor(gifPickerFor === "dm" ? null : "dm"); setGifQuery(""); }}><Images size={19}/><span>GIF</span></button><button className="send-button" type="submit" disabled={!dmDraft.trim()} title="Отправить"><Send size={18}/></button></form>
          </div>
        </> : <div className="home-content">
          <div className="home-welcome"><div className="home-welcome-icon"><MessageCircle size={25}/></div><span>ТВОЙ УГОЛОК В NOX</span><h1>{activeHomeTab === "Сообщения" ? "Рады тебя видеть" : activeHomeTab}</h1><p>{activeHomeTab === "Друзья" ? "Находи друзей и начинай новые беседы." : activeHomeTab === "Сообщения" || activeHomeTab === "Найти беседу" || activeHomeTab === "Новая беседа" ? "Начни личную беседу или продолжи общение." : activeHomeTab === "Nitro" ? "Дополнительные возможности появятся позже." : activeHomeTab === "Магазин" ? "Магазин оформления появится позже." : "Общайся, открывай сообщества и оставайся на связи."}</p>{homeActionLabel && <button onClick={() => setSearchOpen(true)}><UserRound size={17}/> {homeActionLabel}</button>}</div>
          {activeHomeTab === "Друзья" ? <div className="friend-sections">
            {!user && <p className="friend-empty">Войди в аккаунт, чтобы добавлять друзей и видеть заявки.</p>}
            {incomingFriendRequests.length > 0 && <section className="friend-section">
              <h2>Заявки в друзья <span>{incomingFriendRequests.length}</span></h2>
              {incomingFriendRequests.map((person) => <div className="friend-row" key={person.requestId}>
                <ProfileAvatar profile={person} name={person.display_name || person.username} className="dm-avatar" />
                <div className="person-result-copy"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></div>
                <button className="friend-action accept" title="Принять заявку" onClick={() => void respondToFriendRequest(person, true)}><UserCheck size={17}/></button>
                <button className="friend-action decline" title="Отклонить заявку" onClick={() => void respondToFriendRequest(person, false)}><X size={17}/></button>
              </div>)}
            </section>}
            {outgoingFriendRequests.length > 0 && <section className="friend-section">
              <h2>Ожидают ответа <span>{outgoingFriendRequests.length}</span></h2>
              {outgoingFriendRequests.map((person) => <div className="friend-row" key={person.requestId}>
                <ProfileAvatar profile={person} name={person.display_name || person.username} className="dm-avatar" />
                <div className="person-result-copy"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></div>
                <span className="friend-pending-label">Ожидает</span>
              </div>)}
            </section>}
            <section className="friend-section">
              <h2>Друзья <span>{acceptedFriends.length}</span></h2>
              {acceptedFriends.length ? acceptedFriends.map((person) => <div className="friend-row" key={person.requestId}>
                <ProfileAvatar profile={person} name={person.display_name || person.username} className="dm-avatar" />
                <div className="person-result-copy"><strong>{person.display_name || person.username}</strong><small>@{person.username}</small></div>
                <button className="friend-message-button" onClick={() => void openDirectChat(person)}>Написать</button>
              </div>) : <p className="friend-empty">Пока нет друзей. Найди человека и отправь заявку.</p>}
            </section>
          </div> : <>
            <div className="home-section-title"><strong>БЫСТРЫЙ СТАРТ</strong></div><div className="home-cards"><button onClick={() => { if (dmContacts[0]) setActiveDm(dmContacts[0].id); else setSearchOpen(true); }}><span className="quick-icon purple"><MessageSquare size={20}/></span><strong>Личные сообщения</strong><small>Продолжи беседу</small></button><button onClick={() => { if (spaces[0]) { setActiveView("server"); chooseSpace(spaces[0]); } else setCreateSpaceOpen(true); }}><span className="quick-icon green"><Compass size={20}/></span><strong>Твои серверы</strong><small>Вернись в сообщество</small></button></div>
          </>}
        </div>}
      </main> : <main className="chat-area">
        <header className="chat-header">
          <button className="mobile-sidebar-button" title="К списку каналов" onClick={() => setSidebarOpen(true)}><ArrowLeft size={19}/></button>
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

        <div className="messages-scroll" ref={channelScrollRef}>
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
                <button type="button" className="message-profile-trigger" aria-label={`Открыть профиль ${name}`} onClick={(e) => void openMemberCard(e, isOwn ? profile : message.profile, isOwn)}><ProfileAvatar profile={isOwn ? profile : message.profile} name={name} className={`avatar message-avatar ${isOwn ? "own" : ""}`} /></button>
                <div className="message-body">
                  <div className="message-meta"><button type="button" className="message-name-trigger" onClick={(e) => void openMemberCard(e, isOwn ? profile : message.profile, isOwn)}>{name}</button><time>{timeLabel(message.created_at)}</time>
                    <div className="message-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" title="❤️" onClick={() => setMessageReactions(old => ({...old,[message.id]: old[message.id]?.includes("❤️") ? old[message.id].filter(x=>x!=="❤️") : [...(old[message.id]||[]),"❤️"]}))}>❤️</button>
                      <button type="button" title="💀" onClick={() => setMessageReactions(old => ({...old,[message.id]: old[message.id]?.includes("💀") ? old[message.id].filter(x=>x!=="💀") : [...(old[message.id]||[]),"💀"]}))}>💀</button>
                      <button type="button" title="Ответить" onClick={() => {setReplyTarget({id:message.id,userId:message.user_id,author:name,content:message.content,direct:false});setDraft("");}}><Reply size={15}/></button>
                      <button type="button" title="Копировать" onClick={() => void navigator.clipboard?.writeText(message.content.startsWith("GIF:") ? message.content.slice(4) : message.content)}><Forward size={15}/></button>
                      <button type="button" title="Ещё" onClick={() => setMessageMenuOpen(messageMenuOpen===message.id?null:message.id)}><MoreHorizontal size={16}/></button>
                      {messageMenuOpen===message.id && <div className="message-more-menu">{isOwn && <button type="button" onClick={() => {setMessageMenuOpen(null);void deleteMessage(message,false);}}><Trash2 size={14}/> Удалить сообщение</button>}<button type="button" onClick={() => {setMessageMenuOpen(null);void navigator.clipboard?.writeText(message.content);}}>Копировать текст</button></div>}
                    </div>
                  </div>
                  {message.metadata?.reply_to && <div className="message-reply-quote"><b>{message.metadata.reply_author || "Ответ"}</b><span>{message.metadata.reply_content || "Сообщение"}</span></div>}
                  {!!messageReactions[message.id]?.length && <div className="message-reaction-chips">{messageReactions[message.id].map(emoji=><span key={emoji}>{emoji}</span>)}</div>}
                  <MessageContent content={message.content} />
                </div>
              </article>
            );
          })}
        </div>

        <div className="composer-wrap">
          {gifPickerFor === "channel" && <div className="gif-picker"><div className="gif-picker-top"><strong>Поиск GIF</strong><button type="button" onClick={() => setGifPickerFor(null)} aria-label="Закрыть GIF"><X size={17}/></button></div><input className="gif-search" value={gifQuery} onChange={(e) => setGifQuery(e.target.value)} placeholder="Найти GIF…"/><div className="gif-results">{gifLoading ? <span className="gif-state">Загружаю GIF…</span> : gifError ? <span className="gif-state">{gifError}</span> : gifResults.map((gif) => { const url = gif.images?.original?.url || gif.images?.fixed_width?.url || gif.images?.fixed_width_small?.url; return url ? <button type="button" className="gif-result" key={gif.id} onClick={() => void sendGif(url, false)}><img src={gif.images?.fixed_width_small?.url || gif.images?.fixed_width?.url || url} alt={gif.title || "GIF"} loading="lazy"/></button> : null; })}</div><small className="gif-attribution">Powered by GIPHY</small></div>}
          {replyTarget && !replyTarget.direct && <div className="reply-composer-banner"><span>Ответ для <b>{replyTarget.author}</b>: {replyTarget.content.startsWith("GIF:") ? "[GIF]" : replyTarget.content}</span><button type="button" onClick={() => setReplyTarget(null)} aria-label="Отменить ответ"><X size={15}/></button></div>}
          <form className="composer" onSubmit={sendMessage}>
            <label className="composer-plus" title="Прикрепить файл"><Plus size={22}/><input type="file" hidden onChange={(e) => { const file = e.target.files?.[0]; if (file) setDraft((d) => `${d}${d ? " " : ""}[Файл: ${file.name}]`); e.currentTarget.value = ""; }}/></label>
            <input value={draft} onChange={(e) => setDraft(e.target.value)} disabled={slowmodeRemaining > 0} placeholder={slowmodeRemaining > 0 ? `Можно написать через ${slowmodeRemaining} сек.` : `Написать в #${activeChannel?.name || "канал"}`} aria-label="Сообщение" />
            <button type="button" className="composer-tool" title="Эмодзи" onClick={() => setDraft((d) => d + " ✨")}>☺</button>
            <button type="button" className={`composer-tool gif-trigger ${gifPickerFor === "channel" ? "active" : ""}`} title="GIF" onClick={() => { setGifPickerFor(gifPickerFor === "channel" ? null : "channel"); setGifQuery(""); }}><Images size={19}/><span>GIF</span></button>
            <button className="send-button" type="submit" disabled={!draft.trim() || slowmodeRemaining > 0} title={slowmodeRemaining > 0 ? `Подожди ${slowmodeRemaining} сек.` : "Отправить"}><Send size={18}/></button>
          </form>
          <p className="composer-hint">{slowmodeRemaining > 0 ? `Медленный режим: подожди ${slowmodeRemaining} сек.` : "Общайся уважительно. Nox пока находится в разработке."}</p>
        </div>
      </main>}

      {activeView === "server" && membersOpen && <aside className="member-sidebar">
        <div className="member-heading">УЧАСТНИКИ — {user ? members.length : "—"}</div>
        {user && members.length ? members.map((person) => (
          <div className="member-row" key={person.id}>
            <ProfileAvatar profile={person} name={person.display_name || person.username} className="avatar member-avatar" />
            <span>{person.display_name || person.username}</span><i className="online-dot"/>
          </div>
        )) : (
          <div className="member-empty">
            <div className="member-empty-icon"><Users size={22}/></div>
            <strong>Здесь пока тихо</strong>
            <p>Добавь друзей в своё сообщество.</p>
          </div>
        )}
        <div className="right-tip"><span className="tip-spark">✦</span><strong>Маленький совет</strong><p>Создай отдельный канал для каждой темы — так разговоры будет проще находить.</p></div>
      </aside>}

      {searchOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setSearchOpen(false); }}>
        <div className="modal search-modal">
          <button type="button" className="modal-close" onClick={() => setSearchOpen(false)}><X size={19}/></button>
          <h2>Поиск пользователей</h2>
          <label>Ник или отображаемое имя<input autoFocus value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Например, player123"/></label>
          <div className="search-results">
            <strong className="search-label">ЗАРЕГИСТРИРОВАННЫЕ ПОЛЬЗОВАТЕЛИ</strong>
            {!user && <div className="search-empty"><p>Войди в аккаунт, чтобы искать пользователей и отправлять заявки.</p><button className="primary-button" onClick={() => { setSearchOpen(false); setAuthMode("signin"); setShowAuth(true); }}>Войти в аккаунт</button></div>}
            {user && searchQuery.trim().length < 2 && <p className="empty-small">Введи хотя бы 2 символа для поиска.</p>}
            {user && peopleLoading && <p className="empty-small">Ищу пользователей…</p>}
            {user && searchQuery.trim().length >= 2 && !peopleLoading && !peopleResults.length && <p className="empty-small">Никого не нашёл. Проверь написание.</p>}
            {user && peopleResults.map((person) => {
              const name = person.display_name || person.username;
              const relation = friendRelations.find((item) => item.id === person.id);
              const incoming = relation?.status === "pending" && relation.addresseeId === user.id;
              const statusLabel = relation?.status === "accepted" ? "В друзьях" : incoming ? "Принять" : relation ? "Заявка отправлена" : "Добавить в друзья";
              return <div key={person.id} className="search-result contact-result">
                <ProfileAvatar profile={person} name={name} className="dm-avatar" />
                <span className="person-result-copy"><strong>{name}</strong><small>@{person.username}</small></span>
                <div className="search-result-actions">
                  <button className="person-message-action" onClick={() => void openDirectChat(person)}>Написать</button>
                  <button className={`friend-search-action ${relation?.status === "accepted" ? "is-friend" : ""}`} disabled={relation?.status === "accepted" || (!!relation && !incoming)} onClick={() => incoming && relation ? void respondToFriendRequest(relation, true) : void addFriend(person)}>
                    {relation?.status === "accepted" ? <UserCheck size={15}/> : incoming ? <UserCheck size={15}/> : <UserPlus size={15}/>}
                    {statusLabel}
                  </button>
                </div>
              </div>;
            })}
            <strong className="search-label">ПОИСК ПО СООБЩЕНИЯМ</strong>
            {searchResults.map((m) => <button key={`${m.channel_id}-${m.id}`} className="search-result" onClick={() => { const target = spaces.flatMap((s) => channelsBySpace[s.id] || []).find((c) => c.id === m.channel_id); if (target) { setActiveView("server"); setActiveSpaceId(target.server_id); setActiveChannelId(target.id); } else showNotice(`Сообщение из канала #${m.channel_id.replace(/^demo-/, "")}`); setSearchOpen(false); }}><strong>#{(channels.find((c) => c.id === m.channel_id)?.name || m.channel_id.replace(/^demo-/, ""))}</strong><span>{m.content}</span></button>)}
          </div>
        </div>
      </div>}

      {profilePopoverOpen && profilePopoverAnchor && <>
        <button type="button" className="profile-popover-dismiss" aria-label="Закрыть профиль" onClick={() => setProfilePopoverOpen(false)} />
        <section className="profile-popover" style={{ left: profilePopoverAnchor.left, bottom: profilePopoverAnchor.bottom }}>
          <button type="button" className="profile-popover-close" aria-label="Закрыть" onClick={() => setProfilePopoverOpen(false)}><X size={17}/></button>
          <div className="profile-popover-banner" style={profile?.nitro_banner_url && profile.nitro_expires_at && new Date(profile.nitro_expires_at).getTime() > Date.now() ? { backgroundImage: `url("${profile.nitro_banner_url}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
          <div className="profile-popover-main">
            <button type="button" className="profile-popover-avatar" title="Сменить аватар" onClick={openAvatarPicker}>
              <ProfileAvatar profile={{ ...(profile || { id: "profile", username: "profile", display_name: currentName }), presence_status: presence }} name={currentName} avatarBackground={profile?.nitro_avatar_bg || undefined} className={`avatar ${profile?.nitro_frame && profile.nitro_frame !== "none" && profile.nitro_expires_at && new Date(profile.nitro_expires_at).getTime() > Date.now() ? `nitro-frame-${profile.nitro_frame}` : ""}`} />
              <ImagePlus size={15}/>
            </button>
            <strong>{currentName}</strong>
            <span className="profile-popover-username">@{profile?.username || "profile"}</span>
            <div className="profile-popover-status"><i className={`presence-dot status-${presence}`}/>{presenceLabel(presence)}</div>
            {profile?.nitro_expires_at && new Date(profile.nitro_expires_at).getTime() > Date.now() && <span className="nox-nitro-badge">💎 NOX NITRO</span>}
            {isNoxAdmin && <button type="button" className="nitro-admin-open" onClick={() => { setNitroAdminOpen(true); setProfilePopoverOpen(false); }}>💎 Панель выдачи Nitro</button>}
            <div className="profile-popover-bio">{profile?.bio?.trim() || "Пока без описания."}</div>
            <button type="button" className="profile-edit-button" onClick={openProfileSettings}><Settings size={15}/> Редактировать профиль</button>
          </div>
        </section>
      </>}

      {memberCardProfile && memberCardAnchor && <>
        <button type="button" className="profile-popover-dismiss" aria-label="Закрыть профиль" onClick={closeMemberCard} />
        <section className="profile-popover member-profile-card" style={{ left: memberCardAnchor.left, bottom: memberCardAnchor.bottom }}>
          <button type="button" className="profile-popover-close" aria-label="Закрыть" onClick={closeMemberCard}><X size={17}/></button>
          <div className="profile-popover-banner" style={memberCardProfile.nitro_banner_url && memberCardProfile.nitro_expires_at && new Date(memberCardProfile.nitro_expires_at).getTime() > Date.now() ? { backgroundImage: `url("${memberCardProfile.nitro_banner_url}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined} />
          <div className="profile-popover-main">
            <ProfileAvatar profile={memberCardProfile} name={memberCardProfile.display_name || memberCardProfile.username} avatarBackground={memberCardProfile.nitro_avatar_bg || undefined} className={`avatar profile-card-avatar ${memberCardProfile.nitro_frame && memberCardProfile.nitro_frame !== "none" && memberCardProfile.nitro_expires_at && new Date(memberCardProfile.nitro_expires_at).getTime() > Date.now() ? `nitro-frame-${memberCardProfile.nitro_frame}` : ""}`} />
            <strong>{memberCardProfile.display_name || memberCardProfile.username}</strong>
            <span className="profile-popover-username">@{memberCardProfile.username}</span>
            <div className="profile-popover-status"><i className={`presence-dot status-${memberCardProfile.presence_status || "invisible"}`}/>{memberCardProfile.presence_status ? presenceLabel(memberCardProfile.presence_status) : "Статус не указан"}</div>
            <div className="profile-popover-bio">{memberCardProfile.bio?.trim() || "Пока без описания."}</div>
            {memberCardIsOwn ? <button type="button" className="profile-edit-button" onClick={() => { closeMemberCard(); openProfileSettings(); }}><Settings size={15}/> Редактировать профиль</button> : <button type="button" className="profile-edit-button" onClick={() => { const person = memberCardProfile; closeMemberCard(); void openDirectChat(person); }}><MessageSquare size={15}/> Написать сообщение</button>}
          </div>
        </section>
      </>}

      {nitroAdminOpen && isNoxAdmin && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setNitroAdminOpen(false); }}>
        <form className="modal nitro-admin-modal" onSubmit={submitNitroGrant}>
          <button type="button" className="modal-close" onClick={() => setNitroAdminOpen(false)}><X size={19}/></button>
          <h2>💎 Панель Nox Nitro</h2>
          <p className="modal-subtitle">Выдача премиум-доступа пользователям</p>
          <label>Ник пользователя<input value={nitroTargetUsername} onChange={(e) => setNitroTargetUsername(e.target.value)} placeholder="например, katayose" required /></label>
          <label>Срок Nitro (дней)<input type="number" min="1" max="3650" step="1" value={nitroDays} onChange={(e) => setNitroDays(e.target.value)} required /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => { setNitroAdminOpen(false); setNitroTargetUsername(""); }}>Закрыть</button><button className="primary-button" disabled={nitroAdminBusy}>{nitroAdminBusy ? "Выдаю…" : "Выдать Nitro"}</button></div>
          <p className="nitro-admin-hint">Чтобы снять Nitro, введи ник и нажми кнопку ниже.</p>
          <button type="button" className="danger-button" disabled={nitroAdminBusy || !nitroTargetUsername.trim()} onClick={() => void revokeNitro(nitroTargetUsername)}>Снять Nitro у пользователя</button>
        </form>
      </div>}

      {profileSettingsOpen && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setProfileSettingsOpen(false); }}>
        <form className="modal profile-edit-modal" onSubmit={saveProfileSettings}>
          <div className="profile-editor-controls">
          <button type="button" className="modal-close" onClick={() => setProfileSettingsOpen(false)}><X size={19}/></button>
          <h2>Редактировать профиль</h2>
          <div className="profile-edit-avatar-row">
            <ProfileAvatar profile={profile} name={currentName} className="avatar profile-edit-avatar" avatarBackground={nitroAvatarBgDraft} />
            <div><strong>{currentName}</strong><small>Аватар виден другим участникам.</small></div>
            <button type="button" className="secondary-button" disabled={avatarBusy} onClick={openAvatarPicker}><ImagePlus size={15}/>{avatarBusy ? "Загрузка…" : "Сменить"}</button>
          </div>
          <label>Отображаемое имя<input value={profileNameDraft} onChange={(e) => setProfileNameDraft(e.target.value)} maxLength={32} required /></label>
          <label>Ник<input value={profileUsernameDraft} onChange={(e) => setProfileUsernameDraft(e.target.value)} maxLength={32} placeholder="username" required /></label>
          <label>О себе<textarea value={profileBioDraft} onChange={(e) => setProfileBioDraft(e.target.value)} maxLength={190} rows={4} placeholder="Расскажи немного о себе" /></label>
          <small className="profile-bio-count">{profileBioDraft.length}/190</small>
          {profile?.nitro_expires_at && new Date(profile.nitro_expires_at).getTime() > Date.now() && <section className="nitro-customize">
            <h3>💎 NOX NITRO — оформление</h3>
            <label>Ссылка на баннер<input type="url" value={nitroBannerDraft} onChange={(e) => setNitroBannerDraft(e.target.value)} placeholder="https://... (GIF или изображение)" /></label>
            <div className="nitro-frame-picker"><strong>Рамка аватара</strong><div className="nitro-frame-grid">
              {[
                {id:"none",name:"Без рамки",icon:"○"},
                {id:"violet",name:"Астра",icon:"✦"},
                {id:"gold",name:"Корона",icon:"♛"},
                {id:"rainbow",name:"Призма",icon:"✧"},
                {id:"fire",name:"Пламя",icon:"♨"},
                {id:"ice",name:"Лёд",icon:"❄"},
                {id:"sakura",name:"Сакура",icon:"❀"},
                {id:"matrix",name:"Кибер",icon:"⌘"}
              ].map((frame) => <button type="button" key={frame.id} className={`nitro-frame-choice nitro-preview-${frame.id} ${nitroFrameDraft===frame.id?"selected":""}`} onClick={() => setNitroFrameDraft(frame.id)}><span className="nitro-frame-demo">{frame.icon}</span><span>{frame.name}</span>{nitroFrameDraft===frame.id && <i>✓</i>}</button>)}
            </div></div>
            <label>Цвет профиля<input type="color" value={nitroAccentDraft} onChange={(e) => setNitroAccentDraft(e.target.value)} /></label>
            <label>Фон за аватаркой<input type="color" value={nitroAvatarBgDraft} onChange={(e) => setNitroAvatarBgDraft(e.target.value)} /></label>
            <small>Поддерживаются JPG, PNG и WebP. Анимированные GIF-аватарки отключены.</small>
          </section>}
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setProfileSettingsOpen(false)}>Отмена</button><button className="primary-button" disabled={profileSaving}>{profileSaving ? "Сохраняю…" : "Сохранить"}</button></div>
          </div>
          <aside className="profile-editor-preview">
            <div className="profile-preview-label">ПРЕДПРОСМОТР ПРОФИЛЯ</div>
            <div className="profile-preview-card">
              <div className="profile-preview-banner" style={{ backgroundColor: nitroAccentDraft, backgroundImage: nitroBannerDraft.trim() ? `url("${nitroBannerDraft.trim()}")` : undefined }} />
              <div className="profile-preview-content">
                <div className="profile-preview-avatar" style={{ backgroundColor: nitroAvatarBgDraft }}>
                  <ProfileAvatar profile={profile} name={profileNameDraft || currentName} avatarBackground={nitroAvatarBgDraft} className={`avatar ${nitroFrameDraft !== "none" ? `nitro-frame-${nitroFrameDraft}` : ""}`} />
                </div>
                <strong>{profileNameDraft || currentName}</strong>
                <span>@{profileUsernameDraft || profile?.username}</span>
                <p>{profileBioDraft || "Твоя биография появится здесь"}</p>
                {profile?.nitro_expires_at && new Date(profile.nitro_expires_at).getTime() > Date.now() && <span className="nox-nitro-badge">💎 NOX NITRO</span>}
              </div>
            </div>
            <p className="profile-preview-tip">Так твой профиль будут видеть другие участники Nox.</p>
          </aside>
        </form>
      </div>}

      <input ref={avatarInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={uploadAvatar} />
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}><X size={15}/></button></div>}

      {channelSettingsOpen && activeChannel && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setChannelSettingsOpen(false); }}>
        <form className="modal" onSubmit={saveChannelSettings}>
          <button type="button" className="modal-close" onClick={() => setChannelSettingsOpen(false)}><X size={19}/></button>
          <h2>Настройки канала</h2>
          <p className="modal-subtitle">#{activeChannel.name}</p>
          <label>Медленный режим — секунд между твоими сообщениями
            <input type="number" min="0" max="21600" step="1" value={slowmodeDraft} onChange={(e) => setSlowmodeDraft(e.target.value)} />
          </label>
          <p className="auth-note">0 — без задержки. Максимум — 21600 секунд (6 часов).</p>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setChannelSettingsOpen(false)}>Отмена</button><button className="primary-button">Сохранить</button></div>
        </form>
      </div>}

      {serverSettingsOpen && activeSpace && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setServerSettingsOpen(false); }}>
        <form className="modal" onSubmit={saveServerSettings}>
          <button type="button" className="modal-close" onClick={() => setServerSettingsOpen(false)}><X size={19}/></button>
          <h2>Настройки сервера</h2>
          <p className="modal-subtitle">Общие настройки «{activeSpace.name}»</p>
          <label>Название сервера<input value={serverNameDraft} onChange={(e) => setServerNameDraft(e.target.value)} maxLength={48} required /></label>
          <p className="auth-note">Новое название увидят все участники сервера.</p>
          <div className="server-settings-actions">
            <button type="button" className="secondary-button" onClick={() => setServerInviteOpen(true)}><UserPlus size={16}/> Пригласить друзей</button>
            <button type="button" className="danger-button" onClick={() => setDeleteServerOpen(true)}><Trash2 size={16}/> Удалить сервер</button>
          </div>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setServerSettingsOpen(false)}>Отмена</button><button className="primary-button">Сохранить</button></div>
        </form>
      </div>}

      {serverInviteOpen && activeSpace && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setServerInviteOpen(false); }}>
        <div className="modal server-invite-modal">
          <button type="button" className="modal-close" onClick={() => setServerInviteOpen(false)}><X size={19}/></button>
          <h2>Пригласить друзей</h2>
          <p className="modal-subtitle">В сервер «{activeSpace.name}»</p>
          <div className="server-invite-list">
            {acceptedFriends.length ? acceptedFriends.map((friend) => {
              const alreadyJoined = members.some((member) => member.id === friend.id);
              return <div className="server-invite-row" key={friend.id}>
                <ProfileAvatar profile={friend} name={friend.display_name || friend.username} className="dm-avatar" />
                <span className="server-invite-copy"><strong>{friend.display_name || friend.username}</strong><small>@{friend.username}</small></span>
                <button className={alreadyJoined ? "friend-pending-label" : "friend-message-button"} disabled={alreadyJoined || invitingFriendId === friend.id} onClick={() => void inviteFriendToServer(friend)}>
                  {alreadyJoined ? "Уже участник" : invitingFriendId === friend.id ? "Приглашаю…" : "Пригласить"}
                </button>
              </div>;
            }) : <p className="friend-empty">Сначала добавь людей в друзья — тогда их можно будет пригласить сюда.</p>}
          </div>
        </div>
      </div>}

      {deleteServerOpen && activeSpace && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteServerOpen(false); }}>
        <div className="modal">
          <button type="button" className="modal-close" onClick={() => setDeleteServerOpen(false)}><X size={19}/></button>
          <h2>Удалить сервер?</h2>
          <p className="modal-subtitle">«{activeSpace.name}», его каналы и сообщения будут удалены у всех участников.</p>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDeleteServerOpen(false)}>Отмена</button><button type="button" className="danger-button" onClick={() => void deleteActiveServer()}>Удалить сервер</button></div>
        </div>
      </div>}

      {deleteChannelOpen && activeChannel && <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteChannelOpen(false); }}>
        <div className="modal">
          <button type="button" className="modal-close" onClick={() => setDeleteChannelOpen(false)}><X size={19}/></button>
          <h2>Удалить канал?</h2>
          <p className="modal-subtitle">Канал #{activeChannel.name} и его сообщения будут удалены.</p>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setDeleteChannelOpen(false)}>Отмена</button><button type="button" className="danger-button" onClick={() => void deleteActiveChannel()}>Удалить канал</button></div>
        </div>
      </div>}

      {(showAuth || !user) && (
        <div className={`modal-backdrop ${user ? "" : "auth-required"}`} onMouseDown={(e) => { if (user && e.target === e.currentTarget) setShowAuth(false); }}>
          <form className="modal auth-modal" onSubmit={submitAuth}>
            {user && <button type="button" className="modal-close" onClick={() => setShowAuth(false)}><X size={19}/></button>}
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
            {!isSupabaseConfigured && <p className="auth-note">Регистрация пока не подключена. Добавь параметры Supabase в настройки проекта, чтобы создать аккаунт.</p>}
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
