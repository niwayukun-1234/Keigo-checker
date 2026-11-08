-- 敬語チェッカー用のテーブル。Supabase の SQL Editor に貼り付けて実行する。
-- どのテーブルも、ログインした本人の行だけ読み書きできる（RLS）。

create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  full_name text not null default '',
  company text not null default '',
  job_title text not null default '',
  signature text not null default '',
  updated_at timestamptz not null default now()
);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  name text not null,
  honorific text not null default 'さん',
  relation text not null,
  politeness smallint not null check (politeness between 1 and 5),
  destination text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  label text not null,
  options jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade default auth.uid(),
  input text not null,
  options jsonb not null,
  candidates jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists history_user_created_idx on public.history (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.contacts enable row level security;
alter table public.presets enable row level security;
alter table public.history enable row level security;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'contacts', 'presets', 'history'] loop
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format(
      'create policy "own rows" on public.%I for all to authenticated
         using ((select auth.uid()) = user_id)
         with check ((select auth.uid()) = user_id)', t);
  end loop;
end $$;
