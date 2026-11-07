-- Replays an editing session produced by the real editor model (scripts/editor-session.ts)
-- through apply_draft_ops, batch by batch, and checks the database ends where the editor did.
\set ON_ERROR_STOP on
\set QUIET on

create temp table session_input (doc jsonb);
insert into session_input values (:'editor_session'::jsonb);
grant select on session_input to authenticated;

insert into auth.users (id, email) values ('a1000000-0000-4000-8000-000000000007', 'eli@example.com');
set role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000007', false);
insert into public.brands (id, workspace_id, name, slug, created_by)
select 'b8000000-0000-4000-8000-000000000001', id, 'Session', 'editor-session', auth.uid() from public.workspaces;

do $$
declare
  v_batch jsonb;
  v_rev bigint := 0;
begin
  for v_batch in select jsonb_array_elements(doc -> 'batches') from session_input loop
    v_rev := public.apply_draft_ops('b8000000-0000-4000-8000-000000000001', v_rev, v_batch);
  end loop;
end;
$$;

select tests.ok(
  (select string_agg(title, '|' order by position) from public.sections
   where brand_id = 'b8000000-0000-4000-8000-000000000001' and parent_id is null)
  = (select doc -> 'expect' ->> 'topTitles' from session_input),
  'section order after drag, duplicate and delete matches the editor');
select tests.ok(
  (select count(*) from public.sections where brand_id = 'b8000000-0000-4000-8000-000000000001')
  = (select (doc -> 'expect' ->> 'sectionCount')::int from session_input),
  'section count matches the editor');
select tests.ok(
  (select count(*) from public.blocks where brand_id = 'b8000000-0000-4000-8000-000000000001')
  = (select (doc -> 'expect' ->> 'blockCount')::int from session_input),
  'block count matches the editor (deleted sections took their blocks with them)');
select tests.ok(
  (select string_agg(b.type, '|' order by b.position) from public.blocks b
   join public.sections s on s.id = b.section_id
   where s.brand_id = 'b8000000-0000-4000-8000-000000000001' and s.title = 'Brand story')
  = (select doc -> 'expect' ->> 'storyBlocks' from session_input),
  'block order inside a section matches the editor');
select tests.ok(
  (select title from public.sections where brand_id = 'b8000000-0000-4000-8000-000000000001' and hidden)
  = (select doc -> 'expect' ->> 'hiddenTitle' from session_input),
  'rename and hide persisted');
select tests.ok(
  (select value #>> '{}' from public.strategy_fields where brand_id = 'b8000000-0000-4000-8000-000000000001' and key = 'mission')
  = 'Feed people well.',
  'strategy text persisted');
select tests.ok(
  not exists (select 1 from public.sections where brand_id = 'b8000000-0000-4000-8000-000000000001' and title = 'Temporary'),
  'a section added and deleted before saving never reached the database');
select tests.ok(
  (select string_agg(t, '|') from (
     select jsonb_array_elements_text(b.props -> 'tokenIds') t from public.blocks b
     where b.brand_id = 'b8000000-0000-4000-8000-000000000001' and b.type = 'palette') x)
  = (select doc -> 'expect' ->> 'paletteTokens' from session_input),
  'deleting a colour removed it from the palette that used it');
select tests.ok(
  not exists (
    select 1 from public.blocks b, jsonb_array_elements(b.props -> 'pairs') p
    where b.brand_id = 'b8000000-0000-4000-8000-000000000001' and b.type = 'color_combinations'),
  'the combination using the deleted colour was removed');
select tests.ok(
  (select count(*) from public.color_tokens where brand_id = 'b8000000-0000-4000-8000-000000000001')
  = (select (doc -> 'expect' ->> 'colorCount')::int from session_input),
  'colour tokens match the editor');
select tests.ok(
  (select hex from public.color_tokens where brand_id = 'b8000000-0000-4000-8000-000000000001' and name = 'Pepper Red')
  = (select doc -> 'expect' ->> 'redHex' from session_input)
  and (select cmyk_override ->> 'm' from public.color_tokens where brand_id = 'b8000000-0000-4000-8000-000000000001' and name = 'Pepper Red') = '80',
  'recolouring and the CMYK override persisted');
select tests.ok(
  (select string_agg(name, '|' order by position) from public.type_styles where brand_id = 'b8000000-0000-4000-8000-000000000001')
  = (select doc -> 'expect' ->> 'styleNames' from session_input),
  'type styles match the editor');
select tests.ok(
  (select max(jsonb_array_length(props -> 'styleIds')) from public.blocks where brand_id = 'b8000000-0000-4000-8000-000000000001' and type = 'type_specimen') = 4,
  'deleting a style removed it from the specimen');
reset role;

\echo 'Editor session tests passed.'
