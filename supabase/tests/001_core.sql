-- Core schema tests: accounts, isolation, draft saving, publishing, access.
\set ON_ERROR_STOP on
\set QUIET on

-- Users: Alice owns a studio, Bob is a stranger, Carol is a viewer in Alice's studio.
insert into auth.users (id, email, raw_user_meta_data) values
  ('a0000000-0000-4000-8000-000000000001', 'alice@example.com', '{"name": "Alice"}'),
  ('b0000000-0000-4000-8000-000000000002', 'bob@example.com', '{}'),
  ('c0000000-0000-4000-8000-000000000003', 'carol@example.com', '{"name": "Carol"}');

select tests.ok((select count(*) from public.profiles) = 3, 'signup creates a profile per user');
select tests.ok(
  (select name from public.workspaces where created_by = 'a0000000-0000-4000-8000-000000000001') = 'Alice''s studio',
  'signup creates a named personal workspace');
select tests.ok(
  (select name from public.workspaces where created_by = 'b0000000-0000-4000-8000-000000000002') = 'My studio',
  'workspace name falls back when no name is given');
select tests.ok(
  (select plan_key from public.subscriptions s join public.workspaces w on w.id = s.workspace_id
   where w.created_by = 'a0000000-0000-4000-8000-000000000001') = 'starter',
  'new workspaces start on the Starter plan');

insert into public.workspace_members (workspace_id, user_id, role)
select id, 'c0000000-0000-4000-8000-000000000003', 'viewer' from public.workspaces
where created_by = 'a0000000-0000-4000-8000-000000000001';
select id as alice_ws from public.workspaces where created_by = 'a0000000-0000-4000-8000-000000000001' \gset

-- ---------------------------------------------------------------------------
-- Alice builds a draft
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);

insert into public.brands (id, workspace_id, name, slug, created_by)
select 'b1000000-0000-4000-8000-000000000001', id, 'Osan Kitchen', 'osan-kitchen', auth.uid()
from public.workspaces;

select tests.ok((select status from public.brands where id = 'b1000000-0000-4000-8000-000000000001') = 'draft', 'new brands are drafts');

select tests.ok(public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 0, $ops$[
  {"op": "upsert", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000001", "title": "Colour", "slug": "colour", "position": 1024}},
  {"op": "upsert", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000002", "title": "Logo", "slug": "logo", "position": 2048}},
  {"op": "upsert", "table": "color_tokens", "row": {"id": "c1000000-0000-4000-8000-000000000001", "name": "Pepper Red", "hex": "#C8402B", "position": 1024}},
  {"op": "upsert", "table": "blocks", "row": {"id": "b1b00000-0000-4000-8000-000000000001", "section_id": "51000000-0000-4000-8000-000000000001", "type": "palette", "position": 1024, "props": {"tokenIds": ["c1000000-0000-4000-8000-000000000001"]}}},
  {"op": "upsert", "table": "strategy_fields", "row": {"key": "mission", "value": "Feed people well."}}
]$ops$::jsonb) = 5, 'a batch of five changes saves and returns the new revision');

select tests.ok((select count(*) from public.sections where brand_id = 'b1000000-0000-4000-8000-000000000001') = 2, 'sections persisted');

select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 4, '[]'::jsonb)$$,
  'SB409', 'a save based on an old revision is refused');

-- Reorder: send only id + position; nothing else changes.
select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 5, $ops$[
  {"op": "upsert", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000002", "position": 512}}
]$ops$::jsonb);
select tests.ok(
  (select string_agg(title, ',' order by position) from public.sections where brand_id = 'b1000000-0000-4000-8000-000000000001') = 'Logo,Colour',
  'reordering persists and touches only position');
select tests.ok((select slug from public.sections where id = '51000000-0000-4000-8000-000000000002') = 'logo', 'patch leaves other columns intact');

-- Colour edits are central: the block keeps the token id, the token holds the value.
select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 6, $ops$[
  {"op": "upsert", "table": "color_tokens", "row": {"id": "c1000000-0000-4000-8000-000000000001", "hex": "#B33A26"}}
]$ops$::jsonb);
select tests.ok((select props->'tokenIds'->>0 from public.blocks where id = 'b1b00000-0000-4000-8000-000000000001') = 'c1000000-0000-4000-8000-000000000001',
  'blocks reference colours by id, so a hex edit needs no block change');

select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 7, '[{"op":"upsert","table":"color_tokens","row":{"id":"c1000000-0000-4000-8000-000000000002","name":"Bad","hex":"red","position":1}}]'::jsonb)$$,
  'color_tokens_hex_check', 'colour tokens only accept normalised hex');
select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 7, '[{"op":"upsert","table":"brands","row":{"id":"b1000000-0000-4000-8000-000000000001"}}]'::jsonb)$$,
  'Unknown table', 'the save function only touches draft content tables');
select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 7, '[{"op":"upsert","table":"blocks","row":{"id":"b1b00000-0000-4000-8000-000000000009","section_id":"51000000-0000-4000-8000-000000000001","type":"carousel","position":1}}]'::jsonb)$$,
  'blocks_type_check', 'unknown block types are rejected');

-- A failed batch changes nothing (atomic).
select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 7, '[
     {"op":"upsert","table":"sections","row":{"id":"51000000-0000-4000-8000-000000000003","title":"Type","slug":"type","position":4096}},
     {"op":"upsert","table":"sections","row":{"id":"51000000-0000-4000-8000-000000000004","title":"","slug":"x","position":1}}
   ]'::jsonb)$$,
  'sections_title_check', 'an invalid change fails the batch');
select tests.ok(not exists (select 1 from public.sections where id = '51000000-0000-4000-8000-000000000003'), 'the valid half of a failed batch was rolled back');

-- Section nesting rules.
select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 7, $ops$[
  {"op": "upsert", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000005", "parent_id": "51000000-0000-4000-8000-000000000001", "title": "Primary colours", "slug": "primary-colours", "position": 1024}}
]$ops$::jsonb);
select tests.throws(
  $$update public.sections set parent_id = '51000000-0000-4000-8000-000000000005' where id = '51000000-0000-4000-8000-000000000001'$$,
  'inside itself', 'a section cannot be moved inside its own child');

-- Deleting a section removes its blocks and subsections.
select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', (select draft_rev from public.brands where id = 'b1000000-0000-4000-8000-000000000001'), $ops$[
  {"op": "upsert", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000006", "title": "Motion", "slug": "motion", "position": 9000}},
  {"op": "upsert", "table": "blocks", "row": {"id": "b1b00000-0000-4000-8000-000000000006", "section_id": "51000000-0000-4000-8000-000000000006", "type": "text", "position": 1}},
  {"op": "delete", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000006"}}
]$ops$::jsonb);
select tests.ok(not exists (select 1 from public.blocks where id = 'b1b00000-0000-4000-8000-000000000006'), 'deleting a section deletes its blocks');

-- A second brand cannot borrow the first brand's sections.
insert into public.brands (id, workspace_id, name, slug, created_by)
select 'b2000000-0000-4000-8000-000000000002', id, 'Verde', 'verde', auth.uid() from public.workspaces;
select tests.throws(
  $$select public.apply_draft_ops('b2000000-0000-4000-8000-000000000002', 0, '[{"op":"upsert","table":"blocks","row":{"id":"b2b00000-0000-4000-8000-000000000001","section_id":"51000000-0000-4000-8000-000000000001","type":"text","position":1}}]'::jsonb)$$,
  '23503', 'a block cannot point at another brand''s section');
select tests.throws(
  $$select public.apply_draft_ops('b2000000-0000-4000-8000-000000000002', 0, '[{"op":"upsert","table":"sections","row":{"id":"51000000-0000-4000-8000-000000000001","title":"Stolen"}}]'::jsonb)$$,
  'Not allowed', 'a save cannot rewrite another brand''s row by id');

-- ---------------------------------------------------------------------------
-- Publishing and the live guide
-- ---------------------------------------------------------------------------
select tests.throws(
  $$select public.publish_version('b1000000-0000-4000-8000-000000000001', '{"schemaVersion":1,"brand":{"id":"b1000000-0000-4000-8000-000000000001"}}', 1)$$,
  'SB409', 'publishing from a stale draft is refused');
select tests.throws(
  $$select public.publish_version('b1000000-0000-4000-8000-000000000001', '{"schemaVersion":1,"brand":{"id":"b2000000-0000-4000-8000-000000000002"}}', (select draft_rev from public.brands where id = 'b1000000-0000-4000-8000-000000000001'))$$,
  'does not belong', 'a snapshot for another brand is refused');

select (public.publish_version(
  'b1000000-0000-4000-8000-000000000001',
  '{"schemaVersion": 1, "brand": {"id": "b1000000-0000-4000-8000-000000000001", "name": "Osan Kitchen"}, "sections": [{"title": "Logo"}]}',
  (select draft_rev from public.brands where id = 'b1000000-0000-4000-8000-000000000001'),
  'First release')).number as v1 \gset
select tests.ok(:v1 = 1, 'first publish is version 1');
select tests.ok((select status from public.brands where id = 'b1000000-0000-4000-8000-000000000001') = 'published', 'brand shows as published');
select tests.ok((select visibility::text from public.brands where id = 'b1000000-0000-4000-8000-000000000001') = 'public', 'first publish makes the guide public');

-- Keep editing the draft after publishing.
select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', (select draft_rev from public.brands where id = 'b1000000-0000-4000-8000-000000000001'), $ops$[
  {"op": "upsert", "table": "sections", "row": {"id": "51000000-0000-4000-8000-000000000002", "title": "Logo system (draft)"}}
]$ops$::jsonb);
select tests.ok(
  (select b.draft_rev > v.draft_rev from public.brands b join public.versions v on v.id = b.current_version_id where b.id = 'b1000000-0000-4000-8000-000000000001'),
  'the app can tell there are unpublished changes');

select tests.throws(
  $$update public.versions set note = 'edited' where brand_id = 'b1000000-0000-4000-8000-000000000001'$$,
  '42501', 'published versions cannot be edited');

reset role;
set role anon;
select set_config('request.jwt.claim.sub', '', false);
select tests.ok(
  (public.get_published_guide('osan-kitchen') -> 'snapshot' -> 'sections' -> 0 ->> 'title') = 'Logo',
  'the live link shows the published version, not the edited draft');
select tests.ok(public.get_published_guide('OSAN-KITCHEN') is not null, 'slugs are case-insensitive on lookup');
select tests.ok(public.get_published_guide('verde') is null, 'an unpublished brand has no live guide');
select tests.ok(public.get_published_guide('nope') is null, 'unknown slugs return nothing');
select tests.throws($$select * from public.brands$$, '42501', 'anonymous visitors cannot read brands directly');
select tests.throws($$select * from public.versions$$, '42501', 'anonymous visitors cannot read versions directly');
reset role;

-- Password protection.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
select tests.throws($$select public.set_guide_access('b1000000-0000-4000-8000-000000000001', 'password', '123')$$, 'at least 6', 'short passwords are refused');
select public.set_guide_access('b1000000-0000-4000-8000-000000000001', 'password', 'pepper-soup');
select tests.throws($$select * from public.guide_access_secrets$$, '42501', 'even the owner cannot read the password hash');
reset role;
set role anon;
select tests.ok((public.get_published_guide('osan-kitchen') ->> 'locked')::boolean, 'no password: locked');
select tests.ok((public.get_published_guide('osan-kitchen', 'wrong') ->> 'locked')::boolean, 'wrong password: locked');
select tests.ok(public.get_published_guide('osan-kitchen', 'wrong') -> 'snapshot' is null, 'a locked response carries no content');
select tests.ok(not (public.get_published_guide('osan-kitchen', 'pepper-soup') ->> 'locked')::boolean, 'right password: unlocked');
reset role;

-- Restore and unpublish.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
select public.publish_version(
  'b1000000-0000-4000-8000-000000000001',
  '{"schemaVersion": 1, "brand": {"id": "b1000000-0000-4000-8000-000000000001"}, "sections": [{"title": "Logo system"}]}',
  (select draft_rev from public.brands where id = 'b1000000-0000-4000-8000-000000000001'));
select (public.restore_version('b1000000-0000-4000-8000-000000000001', (select id from public.versions where number = 1))).number as v3 \gset
select tests.ok(:v3 = 3, 'restoring version 1 publishes it again as version 3');
select tests.ok(
  (select snapshot -> 'sections' -> 0 ->> 'title' from public.versions v join public.brands b on b.current_version_id = v.id where b.id = 'b1000000-0000-4000-8000-000000000001') = 'Logo',
  'the restored content is live');
select public.set_guide_access('b1000000-0000-4000-8000-000000000001', 'unpublished');
reset role;
set role anon;
select tests.ok(public.get_published_guide('osan-kitchen', 'pepper-soup') is null, 'unpublishing takes the guide offline');
reset role;

-- ---------------------------------------------------------------------------
-- Isolation between studios and roles
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', 'b0000000-0000-4000-8000-000000000002', false);
select tests.ok((select count(*) from public.brands) = 0, 'Bob cannot see Alice''s brands');
select tests.ok((select count(*) from public.sections) = 0, 'Bob cannot see Alice''s sections');
select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', 0, '[]'::jsonb)$$,
  'not found', 'Bob cannot save into Alice''s brand');
select tests.throws(
  $$insert into public.sections (brand_id, title, slug, position) values ('b1000000-0000-4000-8000-000000000001', 'x', 'x', 1)$$,
  '42501', 'Bob cannot insert rows into Alice''s brand');
select tests.throws(
  $$select public.publish_version('b1000000-0000-4000-8000-000000000001', '{}', 0)$$,
  'Not allowed', 'Bob cannot publish Alice''s brand');
select tests.throws(
  format($f$insert into public.brands (workspace_id, name, slug, created_by) values (%L, 'Sneaky', 'sneaky', auth.uid())$f$, :'alice_ws'),
  '42501', 'Bob cannot create brands in Alice''s workspace');
select tests.throws(
  $$update public.subscriptions set plan_key = 'agency'$$,
  '42501', 'nobody can change their own plan from the client');

select set_config('request.jwt.claim.sub', 'c0000000-0000-4000-8000-000000000003', false);
select tests.ok((select count(*) from public.brands) = 2, 'Carol (viewer) can see the studio''s brands');
select tests.throws(
  $$select public.apply_draft_ops('b1000000-0000-4000-8000-000000000001', (select draft_rev from public.brands where id = 'b1000000-0000-4000-8000-000000000001'), '[]'::jsonb)$$,
  'not found', 'Carol (viewer) cannot save changes');
update public.sections set title = 'Hacked' where brand_id = 'b1000000-0000-4000-8000-000000000001';
reset role;
select tests.ok(not exists (select 1 from public.sections where title = 'Hacked'), 'nothing was changed by Carol');

-- Deleting a brand cleans up everything under it.
set role authenticated;
select set_config('request.jwt.claim.sub', 'a0000000-0000-4000-8000-000000000001', false);
delete from public.brands where id = 'b1000000-0000-4000-8000-000000000001';
reset role;
select tests.ok(not exists (select 1 from public.sections where brand_id = 'b1000000-0000-4000-8000-000000000001')
  and not exists (select 1 from public.versions where brand_id = 'b1000000-0000-4000-8000-000000000001'),
  'deleting a brand removes its draft and versions');

\echo 'All database tests passed.'
