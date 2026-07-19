create table if not exists public.wines (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  color text,
  varietal text,
  winery text,
  wine text,
  vintage integer,
  region text,
  country text,
  quantity integer not null default 0,
  collection_rating text,
  professional_score text,
  critic_publication text,
  drink_from integer,
  drink_through integer,
  cellaring_status text,
  score_source_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.wines enable row level security;

drop policy if exists "Users can read their own wines" on public.wines;
drop policy if exists "Users can add their own wines" on public.wines;
drop policy if exists "Users can update their own wines" on public.wines;
drop policy if exists "Users can delete their own wines" on public.wines;

create policy "Users can read their own wines"
on public.wines
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can add their own wines"
on public.wines
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own wines"
on public.wines
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own wines"
on public.wines
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists wines_user_id_idx on public.wines(user_id);

create table if not exists public.wine_research (
  wine_id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  research jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wine_id, user_id)
);

alter table public.wine_research enable row level security;

drop policy if exists "Users can read their own wine research" on public.wine_research;
drop policy if exists "Users can add their own wine research" on public.wine_research;
drop policy if exists "Users can update their own wine research" on public.wine_research;
drop policy if exists "Users can delete their own wine research" on public.wine_research;

create policy "Users can read their own wine research"
on public.wine_research
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can add their own wine research"
on public.wine_research
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update their own wine research"
on public.wine_research
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own wine research"
on public.wine_research
for delete
to authenticated
using (auth.uid() = user_id);

create index if not exists wine_research_user_id_idx on public.wine_research(user_id);
