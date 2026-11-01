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
