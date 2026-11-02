-- Public, minimal owner profile lookup for the Nitro purchase request flow.
-- Returns only the public profile fields needed to open a direct conversation.
create or replace function public.get_nox_owner_profile()
returns table (id uuid, username text, display_name text, avatar_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.username, p.display_name, p.avatar_url
  from public.nox_admins a
  join public.profiles p on p.id = a.user_id
  order by a.created_at asc
  limit 1;
$$;

revoke all on function public.get_nox_owner_profile() from public;
grant execute on function public.get_nox_owner_profile() to authenticated;

notify pgrst, 'reload schema';
