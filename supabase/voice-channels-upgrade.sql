-- Run once in Supabase Dashboard -> SQL Editor.
-- Allow Nox voice channels while preserving existing text channels.
alter table public.channels
  drop constraint if exists channels_type_check;

alter table public.channels
  add constraint channels_type_check
  check (type in ('text', 'voice'));
