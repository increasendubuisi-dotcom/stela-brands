-- Cover the composite thread foreign key on ai_messages and keep chronological reads fast.
drop index if exists public.ai_messages_thread_idx;
create index ai_messages_thread_idx on public.ai_messages (thread_id, brand_id, created_at);
