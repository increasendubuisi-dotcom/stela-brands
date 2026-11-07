-- Every built-in template applies cleanly through the real save function.
-- The ops are generated from packages/brand-schema by scripts/template-ops.ts.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-4000-8000-000000000006', 'tess@example.com', '{"name": "Tess"}');

set role authenticated;
select set_config('request.jwt.claim.sub', 'f0000000-0000-4000-8000-000000000006', false);

insert into public.brands (id, workspace_id, name, slug, created_by)
select v.id, w.id, v.name, v.slug, auth.uid()
from public.workspaces w,
  (values ('b7000000-0000-4000-8000-000000000001'::uuid, 'Complete', 'tpl-complete'),
          ('b7000000-0000-4000-8000-000000000002'::uuid, 'Essentials', 'tpl-essentials'),
          ('b7000000-0000-4000-8000-000000000003'::uuid, 'Blank', 'tpl-blank')) as v(id, name, slug);

select public.apply_draft_ops('b7000000-0000-4000-8000-000000000001', 0, :'ops_complete'::jsonb) > 0 as ok \gset
select tests.ok(:'ok'::boolean, 'the Complete template applies in one save');
select tests.ok((select count(*) from public.sections where brand_id = 'b7000000-0000-4000-8000-000000000001' and parent_id is null) = 9,
  'Complete creates nine top-level sections');
select tests.ok((select count(*) from public.blocks b where b.brand_id = 'b7000000-0000-4000-8000-000000000001' and b.type = 'strategy_field') = 13,
  'Complete wires 13 strategy blocks to strategy fields');

select public.apply_draft_ops('b7000000-0000-4000-8000-000000000002', 0, :'ops_essentials'::jsonb);
select tests.ok((select count(*) from public.sections where brand_id = 'b7000000-0000-4000-8000-000000000002') > 0, 'the Essentials template applies');

select public.apply_draft_ops('b7000000-0000-4000-8000-000000000003', 0, :'ops_blank'::jsonb);
select tests.ok((select count(*) from public.sections where brand_id = 'b7000000-0000-4000-8000-000000000003') = 1, 'the Blank template creates one section');
reset role;

\echo 'Template tests passed.'
