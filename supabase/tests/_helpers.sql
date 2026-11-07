-- Test helpers. Run as superuser after migrations.
create schema tests;
grant usage on schema tests to anon, authenticated;

-- Fails the test run if the condition is false.
create function tests.ok(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'FAIL: %', p_message;
  end if;
  raise notice 'ok - %', p_message;
end;
$$;

-- Runs SQL that must fail. p_like matches the SQLSTATE or the message.
create function tests.throws(p_sql text, p_like text, p_message text) returns void
language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
    if v_state = p_like or v_msg ilike '%' || p_like || '%' then
      raise notice 'ok - % (% %)', p_message, v_state, v_msg;
      return;
    end if;
    raise exception 'FAIL: % — expected "%", got % %', p_message, p_like, v_state, v_msg;
  end;
  raise exception 'FAIL: % — expected an error but the statement succeeded', p_message;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;
