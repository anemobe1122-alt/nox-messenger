-- Nox schema for Supabase. Run in Supabase Dashboard -> SQL Editor.
-- This script creates the core schema and Row Level Security policies.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (char_length(username) between 2 and 32),
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.servers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.server_members (
  server_id uuid not null references public.servers(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (server_id, user_id)
);

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  server_id uuid not null references public.servers(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  type text not null default 'text' check (type in ('text')),
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index if not exists messages_channel_created_idx
  on public.messages(channel_id, created_at);
create index if not exists server_members_user_idx
  on public.server_members(user_id);
create index if not exists channels_server_idx
  on public.channels(server_id);


-- Security-definer helper avoids recursive RLS when checking server membership.
create or replace function public.is_server_member(target_server_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.server_members sm
    where sm.server_id = target_server_id and sm.user_id = target_user_id
  );
$$;

revoke all on function public.is_server_member(uuid, uuid) from public;
grant execute on function public.is_server_member(uuid, uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.servers enable row level security;
alter table public.server_members enable row level security;
alter table public.channels enable row level security;
alter table public.messages enable row level security;

-- Profiles are visible to authenticated users so server member names can be shown.
create policy "profiles select authenticated" on public.profiles
  for select to authenticated using (true);
create policy "users insert own profile" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "users update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

create policy "members read their servers" on public.servers
  for select to authenticated using (public.is_server_member(id));
create policy "authenticated create own server" on public.servers
  for insert to authenticated with check (owner_id = auth.uid());
create policy "owners update server" on public.servers
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners delete server" on public.servers
  for delete to authenticated using (owner_id = auth.uid());

create policy "members read memberships" on public.server_members
  for select to authenticated using (public.is_server_member(server_id));
-- MVP: only the owner can add their own initial membership.
-- A safe invitation/join flow should be added before opening this app to the public.
create policy "owner adds self as member" on public.server_members
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid()
    )
  );
create policy "users leave self or owner manages" on public.server_members
  for delete to authenticated using (
    user_id = auth.uid() or exists (
      select 1 from public.servers s where s.id = server_id and s.owner_id = auth.uid()
    )
  );

create policy "members read channels" on public.channels
  for select to authenticated using (public.is_server_member(server_id));
create policy "server owners create channels" on public.channels
  for insert to authenticated with check (
    exists (select 1 from public.servers s
      where s.id = server_id and s.owner_id = auth.uid())
  );

create policy "members read messages" on public.messages
  for select to authenticated using (
    exists (
      select 1 from public.channels c
      where c.id = channel_id and public.is_server_member(c.server_id)
    )
  );
create policy "members send messages as self" on public.messages
  for insert to authenticated with check (
    user_id = auth.uid() and exists (
      select 1 from public.channels c
      join public.server_members sm on sm.server_id = c.server_id
      where c.id = channel_id and sm.user_id = auth.uid()
    )
  );
create policy "authors delete own messages" on public.messages
  for delete to authenticated using (user_id = auth.uid());

-- Create a profile automatically for each new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  base_username text;
begin
  base_username := lower(regexp_replace(split_part(coalesce(new.email, 'user'), '@', 1), '[^a-zA-Z0-9_]', '', 'g'));
  if char_length(base_username) < 2 then base_username := 'user'; end if;
  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    left(base_username, 20) || '_' || left(replace(new.id::text, '-', ''), 8),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, 'user'), '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Realtime delivery for new messages.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
exception when undefined_object then
  raise notice 'Publication supabase_realtime was not found; enable Realtime for public.messages in Supabase Dashboard.';
end $$;
