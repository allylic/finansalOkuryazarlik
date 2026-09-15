alter table public.games
  add column rebalance_ends_at timestamptz;

create table public.player_rebalances (
  game_id uuid not null references public.games(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  ready_at timestamptz not null default now(),
  primary key (game_id, player_id)
);

alter table public.player_rebalances enable row level security;
create policy "rebalance readiness is readable" on public.player_rebalances for select using (true);

create or replace function public.finish_rebalance_if_due(requested_game_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_game public.games%rowtype;
  player_count integer;
  ready_count integer;
begin
  select * into locked_game
  from public.games
  where id = requested_game_id
  for update;

  if not found or locked_game.status <> 'rebalancing' then
    return false;
  end if;

  select count(*) into player_count from public.players where game_id = requested_game_id;
  select count(*) into ready_count from public.player_rebalances where game_id = requested_game_id;

  if locked_game.rebalance_ends_at > now() and ready_count < player_count then
    return false;
  end if;

  update public.games
  set status = 'playing', rebalance_ends_at = null, updated_at = now()
  where id = requested_game_id;

  delete from public.player_rebalances where game_id = requested_game_id;
  return true;
end;
$$;

create or replace function public.submit_rebalance(
  requested_game_id uuid,
  requested_player_id uuid,
  requested_portfolio jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_game public.games%rowtype;
  locked_player public.players%rowtype;
  portfolio_total numeric(14,2);
begin
  select * into locked_game
  from public.games
  where id = requested_game_id
  for update;

  if not found or locked_game.status <> 'rebalancing' then
    raise exception 'Oyun yeniden dağıtım modunda değil.';
  end if;

  if locked_game.rebalance_ends_at <= now() then
    perform public.finish_rebalance_if_due(requested_game_id);
    raise exception 'Yeniden dağıtım süresi doldu.';
  end if;

  select * into locked_player
  from public.players
  where id = requested_player_id and game_id = requested_game_id
  for update;

  if not found then
    raise exception 'Oyuncu bu oyun odasına ait değil.';
  end if;

  portfolio_total :=
    coalesce((requested_portfolio ->> 'hisse')::numeric, 0) +
    coalesce((requested_portfolio ->> 'fon')::numeric, 0) +
    coalesce((requested_portfolio ->> 'eurobond')::numeric, 0) +
    coalesce((requested_portfolio ->> 'altin')::numeric, 0) +
    coalesce((requested_portfolio ->> 'gumus')::numeric, 0) +
    coalesce((requested_portfolio ->> 'faiz')::numeric, 0) +
    coalesce((requested_portfolio ->> 'viop')::numeric, 0) +
    coalesce((requested_portfolio ->> 'tahvil')::numeric, 0);

  if round(portfolio_total, 2) <> locked_player.total_value then
    raise exception 'Portföy toplamı güncel toplam varlığa eşit olmalı.';
  end if;

  update public.players
  set
    hisse = round(coalesce((requested_portfolio ->> 'hisse')::numeric, 0), 2),
    fon = round(coalesce((requested_portfolio ->> 'fon')::numeric, 0), 2),
    eurobond = round(coalesce((requested_portfolio ->> 'eurobond')::numeric, 0), 2),
    altin = round(coalesce((requested_portfolio ->> 'altin')::numeric, 0), 2),
    gumus = round(coalesce((requested_portfolio ->> 'gumus')::numeric, 0), 2),
    faiz = round(coalesce((requested_portfolio ->> 'faiz')::numeric, 0), 2),
    viop = round(coalesce((requested_portfolio ->> 'viop')::numeric, 0), 2),
    tahvil = round(coalesce((requested_portfolio ->> 'tahvil')::numeric, 0), 2)
  where id = requested_player_id;

  insert into public.player_rebalances (game_id, player_id)
  values (requested_game_id, requested_player_id)
  on conflict (game_id, player_id) do update set ready_at = now();

  return public.finish_rebalance_if_due(requested_game_id);
end;
$$;

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
  next_status := case when (locked_game.round_count + 1) % 3 = 0 then 'rebalancing' else 'playing' end;
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

grant execute on function public.finish_rebalance_if_due(uuid) to anon, authenticated;
grant execute on function public.submit_rebalance(uuid, uuid, jsonb) to anon, authenticated;
grant execute on function public.draw_news_for_game(uuid, uuid) to anon, authenticated;
alter publication supabase_realtime add table public.player_rebalances;
