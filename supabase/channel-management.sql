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
