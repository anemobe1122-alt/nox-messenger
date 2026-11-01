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
