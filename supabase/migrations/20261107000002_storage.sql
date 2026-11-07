-- Private bucket for brand assets. Objects are keyed <brand_id>/<asset_id>/<filename>.
-- Designers read and write through RLS; clients of a published guide never touch
-- storage directly: the server issues short-lived signed URLs for assets that the
-- published snapshot lists (downloadable ones for downloads, all listed ones for display).
--
-- Skipped when the storage schema is absent (local test database).

do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'storage schema not found; skipping storage policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit)
  values ('brand-assets', 'brand-assets', false, 1073741824)
  on conflict (id) do nothing;

  execute $p$
    create policy brand_assets_select on storage.objects for select to authenticated
    using (bucket_id = 'brand-assets' and public.can_view_brand(nullif(split_part(name, '/', 1), '')::uuid))
  $p$;
  execute $p$
    create policy brand_assets_insert on storage.objects for insert to authenticated
    with check (bucket_id = 'brand-assets' and public.can_edit_brand(nullif(split_part(name, '/', 1), '')::uuid))
  $p$;
  execute $p$
    create policy brand_assets_update on storage.objects for update to authenticated
    using (bucket_id = 'brand-assets' and public.can_edit_brand(nullif(split_part(name, '/', 1), '')::uuid))
  $p$;
  execute $p$
    create policy brand_assets_delete on storage.objects for delete to authenticated
    using (bucket_id = 'brand-assets' and public.can_edit_brand(nullif(split_part(name, '/', 1), '')::uuid))
  $p$;
end;
$outer$;
