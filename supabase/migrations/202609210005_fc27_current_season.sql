begin;

update public.clubs set code='COV', name='Coventry City', city='Coventry', starting_budget=52000000
where code='BUR' and competition_id=(select id from public.competitions where code='PL');
update public.clubs set code='HUL', name='Hull City', city='Hull', starting_budget=50000000
where code='WHU' and competition_id=(select id from public.competitions where code='PL');
update public.clubs set code='IPS', name='Ipswich', city='Ipswich', starting_budget=52000000
where code='WOL' and competition_id=(select id from public.competitions where code='PL');

update public.clubs set code='DEP', name='RC Deportivo', city='A Coruña', starting_budget=52000000
where code='MLL' and competition_id=(select id from public.competitions where code='LALIGA');
update public.clubs set code='RAC', name='Racing Club', city='Santander', starting_budget=50000000
where code='GIR' and competition_id=(select id from public.competitions where code='LALIGA');
update public.clubs set code='MAL', name='Málaga CF', city='Málaga', starting_budget=50000000
where code='OVI' and competition_id=(select id from public.competitions where code='LALIGA');

insert into public.data_sources(code,name,version,source_url,license)
values('EA_FC27_OFFICIAL','EA SPORTS FC 27 Official Ratings','2026-09-final','https://www.ea.com/games/ea-sports-fc/ratings','EA public ratings data')
on conflict(code) do update set name=excluded.name,version=excluded.version,source_url=excluded.source_url,license=excluded.license;

commit;
