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
