create extension if not exists "pgcrypto";

create table public.news (
  id bigint generated always as identity primary key,
  haber_metni text not null,
  hisse_etki double precision not null,
  fon_etki double precision not null,
  eurobond_etki double precision not null,
  altin_etki double precision not null,
  gumus_etki double precision not null,
  faiz_etki double precision not null,
  viop_etki double precision not null,
  tahvil_etki double precision not null
);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'waiting' check (status in ('waiting', 'playing', 'rebalancing', 'finished')),
  current_turn_index integer not null default 0 check (current_turn_index >= 0),
  round_count integer not null default 0 check (round_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.players (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 40),
  total_value numeric(14,2) not null default 1000000.00 check (total_value >= 0),
  hisse numeric(14,2) not null default 0 check (hisse >= 0),
  fon numeric(14,2) not null default 0 check (fon >= 0),
  eurobond numeric(14,2) not null default 0 check (eurobond >= 0),
  altin numeric(14,2) not null default 0 check (altin >= 0),
  gumus numeric(14,2) not null default 0 check (gumus >= 0),
  faiz numeric(14,2) not null default 0 check (faiz >= 0),
  viop numeric(14,2) not null default 0 check (viop >= 0),
  tahvil numeric(14,2) not null default 0 check (tahvil >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (game_id, name)
);

create index players_game_id_idx on public.players(game_id);

alter table public.news enable row level security;
alter table public.games enable row level security;
alter table public.players enable row level security;

create policy "news are readable" on public.news for select using (true);
create policy "games are readable" on public.games for select using (true);
create policy "games can be created" on public.games for insert with check (true);
create policy "games can be updated" on public.games for update using (true) with check (true);
create policy "players are readable" on public.players for select using (true);
create policy "players can be created" on public.players for insert with check (true);
create policy "players can be updated" on public.players for update using (true) with check (true);

alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;
