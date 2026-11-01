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
