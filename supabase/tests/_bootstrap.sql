-- Minimal stand-in for the parts of Supabase the migrations rely on, so the
-- schema and its row-level security can be tested on plain Postgres.
-- Mirrors Supabase: auth.uid() reads the JWT subject from request.jwt.claim.sub.

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id uuid primary key,
  email text unique,
  raw_user_meta_data jsonb not null default '{}'
);

create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
