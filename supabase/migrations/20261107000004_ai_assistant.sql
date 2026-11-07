-- AI brand strategy assistant (Phase 2).
--
-- Conversations, messages, the brand's rolling project memory, reviewable
-- proposals and monthly token usage. Brand-scoped tables follow the same access
-- rules as the guide itself. Usage can only be increased, through a function.

create table public.ai_threads (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  kind text not null default 'discovery' check (kind in ('discovery', 'section')),
  title text check (char_length(title) <= 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, brand_id)
);
create index ai_threads_brand_idx on public.ai_threads (brand_id, updated_at desc);
create index ai_threads_created_by_idx on public.ai_threads (created_by);

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  brand_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 20000),
  created_at timestamptz not null default now(),
  foreign key (thread_id, brand_id) references public.ai_threads (id, brand_id) on delete cascade
);
create index ai_messages_thread_idx on public.ai_messages (thread_id, created_at);
create index ai_messages_brand_idx on public.ai_messages (brand_id);

-- Rolling summary of everything discussed, so a new conversation never starts from zero.
create table public.ai_memory (
  brand_id uuid primary key references public.brands (id) on delete cascade,
  summary text not null default '' check (char_length(summary) <= 8000),
  message_count integer not null default 0,
  updated_at timestamptz not null default now()
);

create table public.ai_proposals (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands (id) on delete cascade,
  thread_id uuid,
  output jsonb not null check (jsonb_typeof(output) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  applied_count integer not null default 0,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  foreign key (thread_id, brand_id) references public.ai_threads (id, brand_id) on delete set null (thread_id)
);
create index ai_proposals_brand_idx on public.ai_proposals (brand_id, created_at desc);
create index ai_proposals_thread_idx on public.ai_proposals (thread_id, brand_id) where thread_id is not null;
create index ai_proposals_created_by_idx on public.ai_proposals (created_by);

create table public.ai_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  period date not null,
  tokens bigint not null default 0 check (tokens >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, period)
);

create trigger ai_threads_updated_at before update on public.ai_threads for each row execute function public.set_updated_at();

-- A new message bumps its thread so the latest conversation sorts first.
create function public.touch_ai_thread() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.ai_threads set updated_at = now() where id = new.thread_id;
  return null;
end;
$$;
create trigger ai_messages_touch_thread after insert on public.ai_messages for each row execute function public.touch_ai_thread();
revoke execute on function public.touch_ai_thread() from public, anon, authenticated;

alter table public.ai_threads enable row level security;
alter table public.ai_messages enable row level security;
alter table public.ai_memory enable row level security;
alter table public.ai_proposals enable row level security;
alter table public.ai_usage enable row level security;

do $$
declare t text;
begin
  foreach t in array array['ai_threads', 'ai_messages', 'ai_memory', 'ai_proposals'] loop
    execute format('create policy %I on public.%I for select to authenticated using (private.can_view_brand(brand_id))', t || '_select', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (private.can_edit_brand(brand_id))', t || '_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (private.can_edit_brand(brand_id)) with check (private.can_edit_brand(brand_id))', t || '_update', t);
    execute format('create policy %I on public.%I for delete to authenticated using (private.can_edit_brand(brand_id))', t || '_delete', t);
  end loop;
end;
$$;

create policy ai_usage_select on public.ai_usage for select to authenticated
  using (private.workspace_role_of(workspace_id) is not null);

-- Usage only goes up, and only for members of the workspace, in bounded steps.
create function public.record_ai_usage(p_workspace_id uuid, p_tokens integer)
returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_total bigint;
begin
  if private.workspace_role_of(p_workspace_id) is null then
    raise exception 'Not a member of this workspace' using errcode = 'insufficient_privilege';
  end if;
  if p_tokens is null or p_tokens < 0 or p_tokens > 500000 then
    raise exception 'Invalid token count' using errcode = 'invalid_parameter_value';
  end if;
  insert into public.ai_usage (workspace_id, period, tokens)
  values (p_workspace_id, date_trunc('month', now())::date, p_tokens)
  on conflict (workspace_id, period) do update set tokens = ai_usage.tokens + excluded.tokens, updated_at = now()
  returning tokens into v_total;
  return v_total;
end;
$$;

create function public.ai_usage_this_month(p_workspace_id uuid)
returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((
    select tokens from public.ai_usage
    where workspace_id = p_workspace_id and period = date_trunc('month', now())::date
      and private.workspace_role_of(p_workspace_id) is not null
  ), 0);
$$;

revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant select, insert, update, delete on public.ai_threads, public.ai_messages, public.ai_memory, public.ai_proposals to authenticated;
revoke all on public.ai_threads, public.ai_messages, public.ai_memory, public.ai_proposals from anon;
revoke execute on function public.record_ai_usage(uuid, integer), public.ai_usage_this_month(uuid) from public, anon;
grant execute on function public.record_ai_usage(uuid, integer), public.ai_usage_this_month(uuid) to authenticated, service_role;
