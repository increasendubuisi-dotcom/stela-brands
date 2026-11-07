-- AI assistant tables: brand isolation and increment-only usage.
\set ON_ERROR_STOP on
\set QUIET on

insert into auth.users (id, email) values
  ('a2000000-0000-4000-8000-000000000008', 'ada@example.com'),
  ('a3000000-0000-4000-8000-000000000009', 'ben@example.com');
select id as ada_ws from public.workspaces where created_by = 'a2000000-0000-4000-8000-000000000008' \gset

set role authenticated;
select set_config('request.jwt.claim.sub', 'a2000000-0000-4000-8000-000000000008', false);
insert into public.brands (id, workspace_id, name, slug, created_by)
values ('b9000000-0000-4000-8000-000000000001', :'ada_ws', 'Ada Co', 'ada-co', auth.uid());
insert into public.ai_threads (id, brand_id, created_by)
values ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', auth.uid());
insert into public.ai_messages (thread_id, brand_id, role, content) values
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'user', 'We sell jollof to office workers.'),
  ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'assistant', 'Who else do they buy lunch from?');
select tests.ok((select count(*) from public.ai_messages where thread_id = 'c9000000-0000-4000-8000-000000000001') = 2, 'an editor can keep a conversation');

select tests.ok(public.record_ai_usage(:'ada_ws', 1200) = 1200, 'usage is recorded');
select tests.ok(public.record_ai_usage(:'ada_ws', 300) = 1500, 'usage accumulates within the month');
select tests.ok(public.ai_usage_this_month(:'ada_ws') = 1500, 'usage can be read back');
select tests.throws(format($f$select public.record_ai_usage(%L, -5000)$f$, :'ada_ws'), 'Invalid token count', 'usage cannot be reduced');
select tests.throws($$update public.ai_usage set tokens = 0$$, '42501', 'usage cannot be edited directly');

select set_config('request.jwt.claim.sub', 'a3000000-0000-4000-8000-000000000009', false);
select tests.ok((select count(*) from public.ai_messages) = 0, 'another studio cannot read the conversation');
select tests.throws(
  $$insert into public.ai_messages (thread_id, brand_id, role, content) values ('c9000000-0000-4000-8000-000000000001', 'b9000000-0000-4000-8000-000000000001', 'user', 'hi')$$,
  '42501', 'another studio cannot write into the conversation');
select tests.throws(format($f$select public.record_ai_usage(%L, 10)$f$, :'ada_ws'), 'Not a member', 'outsiders cannot touch a studio''s usage');
select tests.ok(public.ai_usage_this_month(:'ada_ws') = 0, 'outsiders see no usage');
reset role;

\echo 'AI tests passed.'
