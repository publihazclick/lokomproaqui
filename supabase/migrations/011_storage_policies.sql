-- Permite subir/leer/actualizar/borrar archivos del bucket de medios (mismo patron USING(true) del resto del proyecto)

create policy "lokomproaqui_media_select" on storage.objects for select
  using (bucket_id = 'lokomproaqui-media');

create policy "lokomproaqui_media_insert" on storage.objects for insert
  with check (bucket_id = 'lokomproaqui-media');

create policy "lokomproaqui_media_update" on storage.objects for update
  using (bucket_id = 'lokomproaqui-media');

create policy "lokomproaqui_media_delete" on storage.objects for delete
  using (bucket_id = 'lokomproaqui-media');
