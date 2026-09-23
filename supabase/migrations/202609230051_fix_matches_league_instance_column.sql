begin;

-- The original matches migration misspelled this column as league_instantace_id.
-- The match engine, reports and scheduler consistently use league_instance_id.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='matches' and column_name='league_instantace_id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='matches' and column_name='league_instance_id'
  ) then
    alter table public.matches rename column league_instantace_id to league_instance_id;
  end if;
end $$;

commit;
