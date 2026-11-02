-- Storage bucket for photo and video attachments in Nox chats.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  52428800,
  array['image/jpeg','image/png','image/gif','image/webp','image/avif','video/mp4','video/webm','video/quicktime']
)
on conflict (id) do update
set public = true,
    file_size_limit = 52428800,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Chat media authenticated upload" on storage.objects;
create policy "Chat media authenticated upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Chat media public read" on storage.objects;
create policy "Chat media public read"
on storage.objects for select to public
using (bucket_id = 'chat-media');
