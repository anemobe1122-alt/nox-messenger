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
