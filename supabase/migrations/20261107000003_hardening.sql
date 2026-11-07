-- Hardening after the Supabase advisors review.
--
-- 1. Permission helpers move to a private schema that the REST API does not
--    expose. Policies keep working (they reference functions by id); function
--    bodies that call the helpers by name are rewritten to the new schema.
-- 2. Trigger functions are not callable as RPCs.
-- 3. auth.uid() in policies is evaluated once per query, not once per row.
-- 4. Covering indexes for foreign keys; no overlapping permissive policies.

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

alter function public.workspace_role_of(uuid) set schema private;
alter function public.brand_role_of(uuid) set schema private;
alter function public.can_view_brand(uuid) set schema private;
alter function public.can_edit_brand(uuid) set schema private;

do $$
declare
  fn regprocedure;
  def text;
begin
  foreach fn in array array[
    'private.can_view_brand(uuid)'::regprocedure,
    'private.can_edit_brand(uuid)'::regprocedure,
    'public.publish_version(uuid, jsonb, bigint, text)'::regprocedure,
    'public.set_guide_access(uuid, public.guide_visibility, text)'::regprocedure
  ] loop
    def := pg_get_functiondef(fn);
    def := replace(def, 'public.brand_role_of(', 'private.brand_role_of(');
    def := replace(def, 'public.can_edit_brand(', 'private.can_edit_brand(');
    def := replace(def, 'public.can_view_brand(', 'private.can_view_brand(');
    execute def;
  end loop;
end;
$$;

-- Trigger functions: never callable directly.
revoke execute on function
  public.set_updated_at(),
  public.bump_draft_rev(),
  public.check_section_tree(),
  public.prevent_version_update(),
  public.on_workspace_created(),
  public.on_auth_user_created()
from public, anon, authenticated;

-- New functions are not callable by API roles unless granted explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- Policies: evaluate auth.uid() once per statement.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1 from public.workspace_members mine
    join public.workspace_members theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.id
  )
);
drop policy profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

drop policy workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));

drop policy brands_insert on public.brands;
create policy brands_insert on public.brands for insert to authenticated
  with check (private.workspace_role_of(workspace_id) in ('owner', 'admin', 'editor') and created_by = (select auth.uid()));
drop policy brands_delete on public.brands;
create policy brands_delete on public.brands for delete to authenticated
  using (private.workspace_role_of(workspace_id) in ('owner', 'admin') or (created_by = (select auth.uid()) and private.can_edit_brand(id)));

-- One permissive policy per action on workspace_members.
drop policy members_write on public.workspace_members;
create policy members_insert on public.workspace_members for insert to authenticated
  with check (private.workspace_role_of(workspace_id) in ('owner', 'admin'));
create policy members_update on public.workspace_members for update to authenticated
  using (private.workspace_role_of(workspace_id) in ('owner', 'admin'))
  with check (private.workspace_role_of(workspace_id) in ('owner', 'admin'));
create policy members_delete on public.workspace_members for delete to authenticated
  using (private.workspace_role_of(workspace_id) in ('owner', 'admin'));

-- Covering indexes for foreign keys (cascades and joins).
create index if not exists blocks_section_brand_idx on public.blocks (section_id, brand_id);
create index if not exists blocks_parent_idx on public.blocks (parent_block_id, section_id) where parent_block_id is not null;
create index if not exists sections_parent_idx on public.sections (parent_id, brand_id) where parent_id is not null;
create index if not exists font_files_family_idx on public.font_files (family_id, brand_id);
create index if not exists font_files_asset_idx on public.font_files (asset_id, brand_id);
create index if not exists font_files_brand_idx on public.font_files (brand_id);
create index if not exists type_families_brand_idx on public.type_families (brand_id);
create index if not exists type_styles_family_idx on public.type_styles (family_id, brand_id);
create index if not exists brands_current_version_idx on public.brands (current_version_id, id) where current_version_id is not null;
create index if not exists brands_created_by_idx on public.brands (created_by);
create index if not exists assets_created_by_idx on public.assets (created_by);
create index if not exists versions_published_by_idx on public.versions (published_by);
create index if not exists workspaces_created_by_idx on public.workspaces (created_by);
