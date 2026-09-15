create table public.game_portfolio_snapshots (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  hisse numeric(14,2) not null,
  fon numeric(14,2) not null,
  eurobond numeric(14,2) not null,
  altin numeric(14,2) not null,
  gumus numeric(14,2) not null,
  faiz numeric(14,2) not null,
  viop numeric(14,2) not null,
  tahvil numeric(14,2) not null,
  primary key (game_id, player_id)
);

alter table public.game_portfolio_snapshots enable row level security;
create policy "portfolio snapshots are readable" on public.game_portfolio_snapshots for select using (true);

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
  next_status text;
  rebalance_deadline timestamptz;
begin
  select * into locked_game from public.games where id = requested_game_id for update;

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

  insert into public.game_portfolio_snapshots (game_id, player_id, hisse, fon, eurobond, altin, gumus, faiz, viop, tahvil)
  select game_id, id, hisse, fon, eurobond, altin, gumus, faiz, viop, tahvil
  from public.players
  where game_id = requested_game_id
  on conflict (game_id, player_id) do nothing;

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

  for updated_player in select * from public.players where game_id = requested_game_id for update loop
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
        updated_player.hisse * selected_news.hisse_etki + updated_player.fon * selected_news.fon_etki +
        updated_player.eurobond * selected_news.eurobond_etki + updated_player.altin * selected_news.altin_etki +
        updated_player.gumus * selected_news.gumus_etki + updated_player.faiz * selected_news.faiz_etki +
        updated_player.viop * selected_news.viop_etki + updated_player.tahvil * selected_news.tahvil_etki
      )::numeric, 2)
    where id = updated_player.id;
  end loop;

  insert into public.game_news (game_id, news_id, drawn_by, round_number)
  values (requested_game_id, selected_news.id, current_player_id, locked_game.round_count + 1);

  select count(*) into player_count from public.players where game_id = requested_game_id;
  next_turn_index := (locked_game.current_turn_index + 1) % player_count;
  next_status := case
    when locked_game.round_count + 1 >= player_count then 'finished'
    when (locked_game.round_count + 1) % 3 = 0 then 'rebalancing'
    else 'playing'
  end;
  rebalance_deadline := case when next_status = 'rebalancing' then now() + interval '2 minutes' else null end;

  update public.games
  set current_turn_index = next_turn_index, round_count = locked_game.round_count + 1,
      status = next_status, rebalance_ends_at = rebalance_deadline, updated_at = now()
  where id = requested_game_id;

  return jsonb_build_object(
    'news', jsonb_build_object('id', selected_news.id, 'haber_metni', selected_news.haber_metni),
    'round_count', locked_game.round_count + 1,
    'status', next_status,
    'rebalance_ends_at', rebalance_deadline
  );
end;
$$;

grant execute on function public.draw_news_for_game(uuid, uuid) to anon, authenticated;
