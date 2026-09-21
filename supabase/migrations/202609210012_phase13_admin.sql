begin;
create table public.admin_audit_log(
 id bigint generated always as identity primary key,actor_user_id uuid not null references public.users(id),action text not null,
 target_type text not null,target_id text,reason text,metadata jsonb not null default '{}',created_at timestamptz not null default timezone('utc',now())
);
create index admin_audit_recent_idx on public.admin_audit_log(created_at desc);

create function public.admin_set_user_blocked(p_actor_user_id uuid,p_target_user_id uuid,p_blocked boolean,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_before boolean;
begin if p_actor_user_id=p_target_user_id and p_blocked then raise exception 'CANNOT_BLOCK_SELF';end if;
 select is_blocked into v_before from public.users where id=p_target_user_id for update;if not found then raise exception 'USER_NOT_FOUND';end if;
 update public.users set is_blocked=p_blocked where id=p_target_user_id;
 insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,reason,metadata)values(p_actor_user_id,case when p_blocked then 'USER_BLOCKED' else 'USER_UNBLOCKED'end,'USER',p_target_user_id::text,p_reason,jsonb_build_object('before',v_before,'after',p_blocked));end$$;

create function public.admin_set_sponsor_active(p_actor_user_id uuid,p_sponsor_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_before boolean;begin select is_active into v_before from public.sponsors where id=p_sponsor_id for update;if not found then raise exception 'SPONSOR_NOT_FOUND';end if;
 update public.sponsors set is_active=p_active where id=p_sponsor_id;insert into public.admin_audit_log(actor_user_id,action,target_type,target_id,metadata)values(p_actor_user_id,'SPONSOR_STATUS_CHANGED','SPONSOR',p_sponsor_id::text,jsonb_build_object('before',v_before,'after',p_active));end$$;

alter table public.admin_audit_log enable row level security;revoke all on table public.admin_audit_log from anon,authenticated;
revoke all on function public.admin_set_user_blocked(uuid,uuid,boolean,text),public.admin_set_sponsor_active(uuid,uuid,boolean)from public,anon,authenticated;
grant execute on function public.admin_set_user_blocked(uuid,uuid,boolean,text),public.admin_set_sponsor_active(uuid,uuid,boolean)to service_role;
commit;
