create table if not exists public.magic_key_store (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.magic_key_store disable row level security;
