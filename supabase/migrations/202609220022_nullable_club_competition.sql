begin;

alter table public.clubs alter column competition_id drop not null;

commit;
