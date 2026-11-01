-- Apply after schema.sql to enable inviting accepted friends and deleting owned servers.

grant delete on public.servers to authenticated;
drop policy if exists "owners delete server" on public.servers;
create policy "owners delete server" on public.servers
  for delete to authenticated using (owner_id = auth.uid());

create or replace function public.invite_friend_to_server(target_server_id uuid, target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare changed_rows integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if target_user_id is null or target_user_id = auth.uid() then raise exception 'Choose another user'; end if;
  if not exists (
    select 1 from public.server_members sm
    where sm.server_id = target_server_id and sm.user_id = auth.uid()
  ) then raise exception 'Only server members can invite'; end if;
  if not exists (
    select 1 from public.friend_requests fr
    where fr.status = 'accepted'
      and ((fr.requester_id = auth.uid() and fr.addressee_id = target_user_id)
        or (fr.requester_id = target_user_id and fr.addressee_id = auth.uid()))
  ) then raise exception 'You can only invite accepted friends'; end if;

  insert into public.server_members (server_id, user_id, role)
  values (target_server_id, target_user_id, 'member')
  on conflict (server_id, user_id) do nothing;
  get diagnostics changed_rows = row_count;
  return changed_rows > 0;
end;
$$;
revoke all on function public.invite_friend_to_server(uuid, uuid) from public;
grant execute on function public.invite_friend_to_server(uuid, uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'server_members'
  ) then
    alter publication supabase_realtime add table public.server_members;
  end if;
exception when undefined_object then
  raise notice 'Publication supabase_realtime was not found; enable Realtime for public.server_members in Supabase Dashboard.';
end $$;

notify pgrst, 'reload schema';
