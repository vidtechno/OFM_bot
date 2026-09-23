-- Migration: 202609230045_legend_ibrahimovic_ovr_and_global_transfer_clean.sql
-- Goal: Set Zlatan Ibrahimović OVR to exactly 91 to match confirmed specifications.

begin;

update public.legend_players
set overall = 91
where slug = 'zlatan-ibrahimovic';

commit;
