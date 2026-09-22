-- Migration: 202609220033_progression_streaks_news_notifications.sql
-- Goal: Manager progression (XP, Global Leaderboard, Streaks, Honours),
-- Captain/Set Pieces, League News, and Idempotent League Notifications.

begin;

-- 1. Manager Profiles progression columns
alter table public.manager_profiles
  add column if not exists xp integer not null default 0,
  add column if not exists current_win_streak integer not null default 0,
  add column if not exists current_unbeaten_streak integer not null default 0,
  add column if not exists best_win_streak integer not null default 0,
  add column if not exists best_unbeaten_streak integer not null default 0;

create index if not exists manager_profiles_xp_idx
on public.manager_profiles(xp desc, wins desc, matches asc, user_id asc);

-- 2. Idempotent Manager XP Events table
create table if not exists public.manager_xp_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  xp_amount integer not null check (xp_amount >= 0),
  reason text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (user_id, match_id, reason)
);

create index if not exists manager_xp_events_user_idx
on public.manager_xp_events(user_id, created_at desc);

-- 3. Manager Honours table
create table if not exists public.manager_honours (
  id uuid primary key default gen_random_uuid(),
  manager_user_id uuid not null references public.users(id) on delete cascade,
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  competition_code text not null,
  season integer not null default 1,
  honour_type text not null,
  title text not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (manager_user_id, league_instance_id, honour_type)
);

create index if not exists manager_honours_user_idx
on public.manager_honours(manager_user_id, created_at desc);

-- 4. Captain and Set Pieces on lineups
alter table public.lineups
  add column if not exists captain_player_id uuid references public.club_players(id) on delete set null,
  add column if not exists penalty_taker_player_id uuid references public.club_players(id) on delete set null,
  add column if not exists free_kick_taker_player_id uuid references public.club_players(id) on delete set null,
  add column if not exists corner_taker_player_id uuid references public.club_players(id) on delete set null;

-- 5. League News Feed table
create table if not exists public.league_news (
  id uuid primary key default gen_random_uuid(),
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  event_type text not null,
  headline text not null,
  payload jsonb not null default '{}'::jsonb,
  dedup_key text unique,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists league_news_instance_idx
on public.league_news(league_instance_id, created_at desc);

-- 6. League Notifications tracking table
create table if not exists public.league_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  league_instance_id uuid not null references public.league_instances(id) on delete cascade,
  notification_type text not null,
  dedup_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default timezone('utc', now())
);

create index if not exists league_notifications_user_instance_idx
on public.league_notifications(user_id, league_instance_id);

-- 7. Idempotent Match Progression RPC
create or replace function public.record_match_manager_progression(p_match_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_match record;
  v_home_user uuid;
  v_away_user uuid;
  v_home_type text;
  v_away_type text;
  v_home_outcome text;
  v_away_outcome text;
  v_home_xp int;
  v_away_xp int;
  v_inserted_id uuid;
begin
  select m.id, m.home_goals, m.away_goals,
         hlc.manager_user_id as home_user_id, hlc.manager_type as home_manager_type,
         alc.manager_user_id as away_user_id, alc.manager_type as away_manager_type
  into v_match
  from public.matches m
  join public.league_clubs hlc on hlc.id = m.home_club_id
  join public.league_clubs alc on alc.id = m.away_club_id
  where m.id = p_match_id;

  if not found then return; end if;

  -- Calculate outcomes
  if v_match.home_goals > v_match.away_goals then
    v_home_outcome := 'WIN'; v_home_xp := 3;
    v_away_outcome := 'LOSS'; v_away_xp := 0;
  elsif v_match.home_goals = v_match.away_goals then
    v_home_outcome := 'DRAW'; v_home_xp := 1;
    v_away_outcome := 'DRAW'; v_away_xp := 1;
  else
    v_home_outcome := 'LOSS'; v_home_xp := 0;
    v_away_outcome := 'WIN'; v_away_xp := 3;
  end if;

  -- Process Home Manager if Human
  if v_match.home_manager_type = 'HUMAN' and v_match.home_user_id is not null then
    insert into public.manager_profiles(user_id) values(v_match.home_user_id) on conflict do nothing;
    
    insert into public.manager_xp_events(user_id, match_id, xp_amount, reason)
    values(v_match.home_user_id, p_match_id, v_home_xp, 'MATCH_' || v_home_outcome)
    on conflict (user_id, match_id, reason) do nothing
    returning id into v_inserted_id;

    if v_inserted_id is not null then
      update public.manager_profiles
      set xp = xp + v_home_xp,
          current_win_streak = case when v_home_outcome = 'WIN' then current_win_streak + 1 else 0 end,
          current_unbeaten_streak = case when v_home_outcome in ('WIN', 'DRAW') then current_unbeaten_streak + 1 else 0 end,
          best_win_streak = case when v_home_outcome = 'WIN' then greatest(best_win_streak, current_win_streak + 1) else best_win_streak end,
          best_unbeaten_streak = case when v_home_outcome in ('WIN', 'DRAW') then greatest(best_unbeaten_streak, current_unbeaten_streak + 1) else best_unbeaten_streak end,
          updated_at = timezone('utc', now())
      where user_id = v_match.home_user_id;
    end if;
  end if;

  -- Process Away Manager if Human
  if v_match.away_manager_type = 'HUMAN' and v_match.away_user_id is not null then
    insert into public.manager_profiles(user_id) values(v_match.away_user_id) on conflict do nothing;

    v_inserted_id := null;
    insert into public.manager_xp_events(user_id, match_id, xp_amount, reason)
    values(v_match.away_user_id, p_match_id, v_away_xp, 'MATCH_' || v_away_outcome)
    on conflict (user_id, match_id, reason) do nothing
    returning id into v_inserted_id;

    if v_inserted_id is not null then
      update public.manager_profiles
      set xp = xp + v_away_xp,
          current_win_streak = case when v_away_outcome = 'WIN' then current_win_streak + 1 else 0 end,
          current_unbeaten_streak = case when v_away_outcome in ('WIN', 'DRAW') then current_unbeaten_streak + 1 else 0 end,
          best_win_streak = case when v_away_outcome = 'WIN' then greatest(best_win_streak, current_win_streak + 1) else best_win_streak end,
          best_unbeaten_streak = case when v_away_outcome in ('WIN', 'DRAW') then greatest(best_unbeaten_streak, current_unbeaten_streak + 1) else best_unbeaten_streak end,
          updated_at = timezone('utc', now())
      where user_id = v_match.away_user_id;
    end if;
  end if;
end;
$$;

-- Trigger to automatically invoke progression on match insert
create or replace function public.trigger_match_progression()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.record_match_manager_progression(new.id);
  return new;
end;
$$;

drop trigger if exists matches_progression_trigger on public.matches;
create trigger matches_progression_trigger
after insert on public.matches
for each row execute function public.trigger_match_progression();

-- Permissions
grant execute on function public.record_match_manager_progression(uuid) to service_role;

commit;
