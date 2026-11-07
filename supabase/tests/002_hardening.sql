-- Hardening checks: nothing internal is reachable through the public API.
\set ON_ERROR_STOP on
\set QUIET on

select tests.ok(to_regprocedure('public.can_edit_brand(uuid)') is null, 'permission helpers are not in the public schema');
select tests.ok(to_regprocedure('private.can_edit_brand(uuid)') is not null, 'permission helpers live in the private schema');

select tests.ok(
  not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype = 'trigger'::regtype
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))
  ),
  'trigger functions cannot be called by API roles');

select tests.ok(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')) = array['get_published_guide'],
  'visitors can call exactly one function: the published guide lookup');

select tests.ok(
  not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and (qual ~ 'auth\.uid\(\)' and qual !~ 'SELECT auth\.uid\(\)'
        or with_check ~ 'auth\.uid\(\)' and with_check !~ 'SELECT auth\.uid\(\)')
  ),
  'policies evaluate auth.uid() once per statement');

-- The moved helpers still enforce access end to end.
insert into auth.users (id, email) values
  ('d0000000-0000-4000-8000-000000000004', 'dana@example.com'),
  ('e0000000-0000-4000-8000-000000000005', 'eve@example.com');

set role authenticated;
select set_config('request.jwt.claim.sub', 'd0000000-0000-4000-8000-000000000004', false);
insert into public.brands (id, workspace_id, name, slug, created_by)
select 'b5000000-0000-4000-8000-000000000005', id, 'Kora', 'kora', auth.uid() from public.workspaces;
select public.apply_draft_ops('b5000000-0000-4000-8000-000000000005', 0, $ops$[
  {"op": "upsert", "table": "sections", "row": {"id": "55000000-0000-4000-8000-000000000001", "title": "Logo", "slug": "logo", "position": 1}}
]$ops$::jsonb);
select public.publish_version('b5000000-0000-4000-8000-000000000005',
  '{"schemaVersion": 1, "brand": {"id": "b5000000-0000-4000-8000-000000000005"}}', 1);
select public.set_guide_access('b5000000-0000-4000-8000-000000000005', 'password', 'kora-2026');
select tests.ok((select status from public.brands where id = 'b5000000-0000-4000-8000-000000000005') = 'published', 'publish works through the moved helpers');

select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000005', false);
select tests.throws($$select public.set_guide_access('b5000000-0000-4000-8000-000000000005', 'public')$$, 'Not allowed', 'a stranger still cannot change access');
reset role;

\echo 'Hardening tests passed.'
