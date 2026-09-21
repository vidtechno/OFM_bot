begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique check (telegram_id > 0),
  username text,
  first_name text not null check (char_length(first_name) between 1 and 255),
  last_name text,
  language_code text,
  is_blocked boolean not null default false,
  last_seen_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index users_username_idx on public.users (lower(username)) where username is not null;
create index users_last_seen_at_idx on public.users (last_seen_at desc);

create trigger users_set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create table public.manager_profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text,
  matches integer not null default 0 check (matches >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  titles integer not null default 0 check (titles >= 0),
  seasons integer not null default 0 check (seasons >= 0),
  total_transfer_spend numeric(16, 2) not null default 0 check (total_transfer_spend >= 0),
  total_transfer_income numeric(16, 2) not null default 0 check (total_transfer_income >= 0),
  biggest_transfer numeric(16, 2) not null default 0 check (biggest_transfer >= 0),
  manager_rating integer not null default 1500,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint manager_profile_record_check check (matches = wins + draws + losses)
);

create index manager_profiles_rating_idx on public.manager_profiles (manager_rating desc);

create trigger manager_profiles_set_updated_at
before update on public.manager_profiles
for each row execute function public.set_updated_at();

create or replace function public.create_manager_profile_for_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.manager_profiles (user_id, display_name)
  values (new.id, coalesce(new.username, new.first_name));
  return new;
end;
$$;

create trigger users_create_manager_profile
after insert on public.users
for each row execute function public.create_manager_profile_for_user();

alter table public.users enable row level security;
alter table public.manager_profiles enable row level security;

comment on table public.users is 'Telegram identities managed only by the trusted bot backend.';
comment on table public.manager_profiles is 'Lifetime manager statistics, independent from a season.';

revoke all on table public.users from anon, authenticated;
revoke all on table public.manager_profiles from anon, authenticated;

commit;
