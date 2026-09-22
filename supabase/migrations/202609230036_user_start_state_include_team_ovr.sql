-- Migration: 202609230036_user_start_state_include_team_ovr.sql
-- Goal: Include real starting XI team OVR in get_user_start_state RPC

begin;

CREATE OR REPLACE FUNCTION public.get_user_start_state(
  p_telegram_id BIGINT,
  p_username TEXT DEFAULT NULL,
  p_first_name TEXT DEFAULT '',
  p_last_name TEXT DEFAULT NULL,
  p_language_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user RECORD;
  v_clubs JSONB;
BEGIN
  -- 1. Fast User Upsert
  INSERT INTO public.users (telegram_id, username, first_name, last_name, language_code, last_seen_at)
  VALUES (p_telegram_id, p_username, p_first_name, p_last_name, p_language_code, timezone('utc'::text, now()))
  ON CONFLICT (telegram_id) DO UPDATE SET
    username = EXCLUDED.username,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    language_code = EXCLUDED.language_code,
    last_seen_at = timezone('utc'::text, now())
  RETURNING id, telegram_id, username, first_name, last_name, language_code, is_blocked
  INTO v_user;

  -- 2. Fast Managed Clubs Query in same transaction with dynamic Starting XI team OVR
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'leagueClubId', lc.id,
        'clubName', c.name,
        'competitionName', comp.name,
        'leagueName', comp.name || ' #' || lpad(li.instance_number::text, 4, '0'),
        'position', 1,
        'points', lc.points,
        'budget', COALESCE(lc.cash_balance, c.starting_budget),
        'teamOvr', public.calculate_club_team_ovr(lc.id)
      ) ORDER BY lc.created_at
    ),
    '[]'::jsonb
  )
  INTO v_clubs
  FROM public.league_clubs lc
  JOIN public.clubs c ON c.id = lc.club_id
  JOIN public.league_instances li ON li.id = lc.league_instance_id
  JOIN public.competitions comp ON comp.id = li.competition_id
  WHERE lc.manager_user_id = v_user.id;

  RETURN jsonb_build_object(
    'user', row_to_json(v_user),
    'managedClubs', v_clubs
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_start_state TO service_role, authenticated;

commit;
