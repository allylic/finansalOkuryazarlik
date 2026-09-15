create table public.game_news (
  id bigint generated always as identity primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  news_id bigint not null references public.news(id),
  drawn_by uuid not null references public.players(id),
  round_number integer not null check (round_number > 0),
  drawn_at timestamptz not null default now(),
  unique (game_id, news_id),
  unique (game_id, round_number)
);

create index game_news_game_id_idx on public.game_news(game_id);

alter table public.game_news enable row level security;
create policy "game news are readable" on public.game_news for select using (true);

create or replace function public.draw_news_for_game(requested_game_id uuid, requested_player_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_game public.games%rowtype;
  current_player_id uuid;
  selected_news public.news%rowtype;
  updated_player public.players%rowtype;
  player_count integer;
  next_turn_index integer;
begin
  select * into locked_game
  from public.games
  where id = requested_game_id
  for update;

  if not found or locked_game.status <> 'playing' then
    raise exception 'Oyun haber çekmeye uygun durumda değil.';
  end if;

  select id into current_player_id
  from public.players
  where game_id = requested_game_id
  order by created_at, id
  offset locked_game.current_turn_index
  limit 1;

  if current_player_id is distinct from requested_player_id then
    raise exception 'Sadece sırası gelen oyuncu haber çekebilir.';
  end if;

  select * into selected_news
  from public.news
  where not exists (
    select 1 from public.game_news
    where game_id = requested_game_id and news_id = public.news.id
  )
  order by random()
  limit 1;

  if not found then
    raise exception 'Kullanılabilecek haber kalmadı.';
  end if;

  for updated_player in
    select * from public.players where game_id = requested_game_id for update
  loop
    update public.players
    set
      hisse = round((updated_player.hisse * selected_news.hisse_etki)::numeric, 2),
      fon = round((updated_player.fon * selected_news.fon_etki)::numeric, 2),
      eurobond = round((updated_player.eurobond * selected_news.eurobond_etki)::numeric, 2),
      altin = round((updated_player.altin * selected_news.altin_etki)::numeric, 2),
      gumus = round((updated_player.gumus * selected_news.gumus_etki)::numeric, 2),
      faiz = round((updated_player.faiz * selected_news.faiz_etki)::numeric, 2),
      viop = round((updated_player.viop * selected_news.viop_etki)::numeric, 2),
      tahvil = round((updated_player.tahvil * selected_news.tahvil_etki)::numeric, 2),
      total_value = round((
        updated_player.hisse * selected_news.hisse_etki +
        updated_player.fon * selected_news.fon_etki +
        updated_player.eurobond * selected_news.eurobond_etki +
        updated_player.altin * selected_news.altin_etki +
        updated_player.gumus * selected_news.gumus_etki +
        updated_player.faiz * selected_news.faiz_etki +
        updated_player.viop * selected_news.viop_etki +
        updated_player.tahvil * selected_news.tahvil_etki
      )::numeric, 2)
    where id = updated_player.id;
  end loop;

  insert into public.game_news (game_id, news_id, drawn_by, round_number)
  values (requested_game_id, selected_news.id, current_player_id, locked_game.round_count + 1);

  select count(*) into player_count from public.players where game_id = requested_game_id;
  next_turn_index := (locked_game.current_turn_index + 1) % player_count;

  update public.games
  set current_turn_index = next_turn_index, round_count = locked_game.round_count + 1, updated_at = now()
  where id = requested_game_id;

  return jsonb_build_object(
    'news', jsonb_build_object('id', selected_news.id, 'haber_metni', selected_news.haber_metni),
    'round_count', locked_game.round_count + 1
  );
end;
$$;

grant execute on function public.draw_news_for_game(uuid, uuid) to anon, authenticated;
alter publication supabase_realtime add table public.game_news;
