-- Apply this once to an existing Nox Supabase project to add searchable users and DMs.
-- New projects can use schema.sql, which also contains these objects.

create table if not exists public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);

create table if not exists public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists direct_conversation_members_user_idx
  on public.direct_conversation_members(user_id);
create index if not exists direct_messages_conversation_created_idx
  on public.direct_messages(conversation_id, created_at);

create or replace function public.is_direct_conversation_member(target_conversation_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.direct_conversation_members dm
    where dm.conversation_id = target_conversation_id and dm.user_id = target_user_id
  );
$$;
revoke all on function public.is_direct_conversation_member(uuid, uuid) from public;
grant execute on function public.is_direct_conversation_member(uuid, uuid) to authenticated;

create or replace function public.create_or_get_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare conversation uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then raise exception 'User not found'; end if;

  perform pg_advisory_xact_lock(hashtextextended(
    least(auth.uid()::text, target_user_id::text) || ':' || greatest(auth.uid()::text, target_user_id::text), 0
  ));

  select mine.conversation_id into conversation
  from public.direct_conversation_members mine
  join public.direct_conversation_members other
    on other.conversation_id = mine.conversation_id and other.user_id = target_user_id
  where mine.user_id = auth.uid()
    and (select count(*) from public.direct_conversation_members all_members
      where all_members.conversation_id = mine.conversation_id) = 2
  limit 1;
  if conversation is not null then return conversation; end if;

  insert into public.direct_conversations default values returning id into conversation;
  insert into public.direct_conversation_members (conversation_id, user_id)
  values (conversation, auth.uid()), (conversation, target_user_id);
  return conversation;
end;
$$;
revoke all on function public.create_or_get_direct_conversation(uuid) from public;
grant execute on function public.create_or_get_direct_conversation(uuid) to authenticated;
grant select on public.direct_conversations, public.direct_conversation_members, public.direct_messages to authenticated;
grant insert, delete on public.direct_messages to authenticated;

alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_members enable row level security;
alter table public.direct_messages enable row level security;

drop policy if exists "members read direct conversations" on public.direct_conversations;
create policy "members read direct conversations" on public.direct_conversations
  for select to authenticated using (public.is_direct_conversation_member(id));
drop policy if exists "members read direct conversation members" on public.direct_conversation_members;
create policy "members read direct conversation members" on public.direct_conversation_members
  for select to authenticated using (public.is_direct_conversation_member(conversation_id));
drop policy if exists "members read direct messages" on public.direct_messages;
create policy "members read direct messages" on public.direct_messages
  for select to authenticated using (public.is_direct_conversation_member(conversation_id));
drop policy if exists "members send direct messages as self" on public.direct_messages;
create policy "members send direct messages as self" on public.direct_messages
  for insert to authenticated with check (
    user_id = auth.uid() and public.is_direct_conversation_member(conversation_id)
  );
drop policy if exists "authors delete own direct messages" on public.direct_messages;
create policy "authors delete own direct messages" on public.direct_messages
  for delete to authenticated using (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_messages'
  ) then
    alter publication supabase_realtime add table public.direct_messages;
  end if;
exception when undefined_object then
  raise notice 'Enable Realtime for public.direct_messages in Supabase Dashboard.';
end $$;

-- Refresh PostgREST's function and table schema cache after applying this migration.
notify pgrst, 'reload schema';

-- Apply to an existing Nox Supabase project to enable deleting your own messages.
-- Run after schema.sql and direct-messages.sql.

grant delete on public.messages, public.direct_messages to authenticated;

drop policy if exists "authors delete own messages" on public.messages;
create policy "authors delete own messages" on public.messages
  for delete to authenticated using (user_id = auth.uid());

drop policy if exists "authors delete own direct messages" on public.direct_messages;
create policy "authors delete own direct messages" on public.direct_messages
  for delete to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';

-- Apply in Supabase SQL Editor to enable friend requests and shared profile avatars.

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create index if not exists friend_requests_addressee_status_idx
  on public.friend_requests(addressee_id, status);

alter table public.friend_requests enable row level security;
drop policy if exists "participants read friend requests" on public.friend_requests;
create policy "participants read friend requests" on public.friend_requests
  for select to authenticated using (requester_id = auth.uid() or addressee_id = auth.uid());
grant select on public.friend_requests to authenticated;

create or replace function public.send_friend_request(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  if not exists (select 1 from public.profiles p where p.id = target_user_id) then raise exception 'User not found'; end if;

  if exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.addressee_id = target_user_id)
        or (fr.requester_id = target_user_id and fr.addressee_id = auth.uid()))
  ) then return 'already_friends'; end if;

  if exists (select 1 from public.friend_requests fr where fr.requester_id = target_user_id and fr.addressee_id = auth.uid() and fr.status = 'pending') then
    update public.friend_requests fr set status = 'accepted'
    where fr.requester_id = target_user_id and fr.addressee_id = auth.uid() and fr.status = 'pending';
    return 'accepted';
  end if;

  if exists (select 1 from public.friend_requests fr where fr.requester_id = auth.uid() and fr.addressee_id = target_user_id and fr.status = 'pending') then
    return 'pending';
  end if;

  insert into public.friend_requests (requester_id, addressee_id) values (auth.uid(), target_user_id);
  return 'pending';
end;
$$;
revoke all on function public.send_friend_request(uuid) from public;
grant execute on function public.send_friend_request(uuid) to authenticated;

create or replace function public.respond_to_friend_request(target_request_id uuid, should_accept boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed_rows integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if should_accept then
    update public.friend_requests fr set status = 'accepted'
    where fr.id = target_request_id and fr.addressee_id = auth.uid() and fr.status = 'pending';
  else
    delete from public.friend_requests fr
    where fr.id = target_request_id and fr.addressee_id = auth.uid() and fr.status = 'pending';
  end if;
  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;
revoke all on function public.respond_to_friend_request(uuid, boolean) from public;
grant execute on function public.respond_to_friend_request(uuid, boolean) to authenticated;

grant update (avatar_url) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "public read profile avatars" on storage.objects;
create policy "public read profile avatars" on storage.objects
  for select to public using (bucket_id = 'avatars');
drop policy if exists "users upload own profile avatar" on storage.objects;
create policy "users upload own profile avatar" on storage.objects
  for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "users replace own profile avatar" on storage.objects;
create policy "users replace own profile avatar" on storage.objects
  for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

notify pgrst, 'reload schema';

-- Apply after schema.sql to configure channel slowmode and owner-only deletion.

alter table public.channels
  add column if not exists slowmode_seconds integer not null default 0
  check (slowmode_seconds between 0 and 21600);

grant update (slowmode_seconds) on table public.channels to authenticated;
grant delete on public.channels to authenticated;

drop policy if exists "server owners update channels" on public.channels;
create policy "server owners update channels" on public.channels
  for update to authenticated using (
    exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
  ) with check (
    exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
  );

drop policy if exists "server owners delete channels" on public.channels;
create policy "server owners delete channels" on public.channels
  for delete to authenticated using (
    exists (select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid())
  );

create or replace function public.enforce_channel_slowmode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cooldown_seconds integer;
  latest_message timestamptz;
  remaining_seconds integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(new.channel_id::text || ':' || new.user_id::text, 0));

  select c.slowmode_seconds into cooldown_seconds
  from public.channels c where c.id = new.channel_id;
  if cooldown_seconds is null or cooldown_seconds <= 0 then return new; end if;

  select max(m.created_at) into latest_message
  from public.messages m
  where m.channel_id = new.channel_id and m.user_id = new.user_id;

  if latest_message is not null then
    remaining_seconds := ceil(extract(epoch from (latest_message + make_interval(secs => cooldown_seconds) - clock_timestamp())))::integer;
    if remaining_seconds > 0 then
      raise exception using message = 'SLOWMODE:' || remaining_seconds::text, errcode = 'P0001';
    end if;
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function public.enforce_channel_slowmode() from public;
grant execute on function public.enforce_channel_slowmode() to authenticated;

drop trigger if exists enforce_channel_slowmode on public.messages;
create trigger enforce_channel_slowmode
  before insert on public.messages
  for each row execute function public.enforce_channel_slowmode();

notify pgrst, 'reload schema';

-- Shared Discord-style profile statuses used by the Nox client.

alter table public.profiles
  add column if not exists presence_status text not null default 'online'
  check (presence_status in ('online', 'idle', 'dnd', 'invisible'));

grant update (presence_status) on public.profiles to authenticated;
grant update (name) on public.servers to authenticated;

-- Needed so clients can refresh presence markers when another user changes status.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
exception when undefined_object then
  raise notice 'Publication supabase_realtime was not found; enable Realtime for public.profiles in Supabase Dashboard.';
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'servers'
  ) then
    alter publication supabase_realtime add table public.servers;
  end if;
exception when undefined_object then
  raise notice 'Publication supabase_realtime was not found; enable Realtime for public.servers in Supabase Dashboard.';
end $$;

notify pgrst, 'reload schema';

-- Discord-style server invitations delivered as persistent direct-message cards.

grant delete on public.servers to authenticated;
drop policy if exists "owners delete server" on public.servers;
create policy "owners delete server" on public.servers
  for delete to authenticated using (owner_id = auth.uid());

alter table public.direct_messages
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'server_invite')),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create table if not exists public.server_invites (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  inviter_id uuid not null references public.profiles(id) on delete cascade,
  invitee_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (inviter_id <> invitee_id)
);

create index if not exists server_invites_invitee_created_idx
  on public.server_invites(invitee_id, created_at desc);
alter table public.server_invites enable row level security;
grant select on public.server_invites to authenticated;
drop policy if exists "participants read server invites" on public.server_invites;
create policy "participants read server invites" on public.server_invites
  for select to authenticated using (inviter_id = auth.uid() or invitee_id = auth.uid());

drop function if exists public.invite_friend_to_server(uuid, uuid);

create or replace function public.send_server_invite(target_server_id uuid, target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  conversation uuid;
  invitation uuid;
  invite_message uuid;
  server_title text;
  member_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  if not exists (
    select 1 from public.server_members sm
    where sm.server_id = target_server_id and sm.user_id = auth.uid()
  ) then raise exception 'Only server members can invite'; end if;
  if exists (
    select 1 from public.server_members sm
    where sm.server_id = target_server_id and sm.user_id = target_user_id
  ) then raise exception 'User is already a server member'; end if;
  if not exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.addressee_id = target_user_id)
        or (fr.requester_id = target_user_id and fr.addressee_id = auth.uid()))
  ) then raise exception 'You can only invite accepted friends'; end if;

  select s.name into server_title from public.servers s where s.id = target_server_id;
  if server_title is null then raise exception 'Server not found'; end if;
  select count(*)::integer into member_count from public.server_members sm where sm.server_id = target_server_id;
  conversation := public.create_or_get_direct_conversation(target_user_id);

  insert into public.server_invites (server_id, inviter_id, invitee_id, conversation_id)
  values (target_server_id, auth.uid(), target_user_id, conversation)
  returning id into invitation;

  insert into public.direct_messages (conversation_id, user_id, content, message_type, metadata)
  values (
    conversation, auth.uid(), 'Приглашение на сервер', 'server_invite',
    jsonb_build_object(
      'invite_id', invitation,
      'server_id', target_server_id,
      'server_name', server_title,
      'member_count', member_count
    )
  ) returning id into invite_message;

  return jsonb_build_object('conversation_id', conversation, 'invite_id', invitation, 'message_id', invite_message);
end;
$$;
revoke all on function public.send_server_invite(uuid, uuid) from public;
grant execute on function public.send_server_invite(uuid, uuid) to authenticated;

create or replace function public.accept_server_invite(target_invite_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_server uuid;
  was_accepted timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select si.server_id, si.accepted_at into target_server, was_accepted
  from public.server_invites si
  where si.id = target_invite_id and si.invitee_id = auth.uid()
  for update;
  if target_server is null then raise exception 'Invitation not found'; end if;
  if was_accepted is not null then return target_server; end if;

  insert into public.server_members (server_id, user_id, role)
  values (target_server, auth.uid(), 'member')
  on conflict (server_id, user_id) do nothing;
  update public.server_invites set accepted_at = now() where id = target_invite_id;
  return target_server;
end;
$$;
revoke all on function public.accept_server_invite(uuid) from public;
grant execute on function public.accept_server_invite(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_members'
  ) then alter publication supabase_realtime add table public.server_members; end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'direct_conversation_members'
  ) then alter publication supabase_realtime add table public.direct_conversation_members; end if;
exception when undefined_object then
  raise notice 'Enable Realtime for public.server_members and public.direct_conversation_members.';
end $$;

notify pgrst, 'reload schema';
-- Shared profile bios and editable display names/usernames.
alter table public.profiles
  add column if not exists bio text not null default '' check (char_length(bio) <= 190);
grant update (username, display_name, bio) on public.profiles to authenticated;
notify pgrst, 'reload schema';
