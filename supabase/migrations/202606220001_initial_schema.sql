create extension if not exists pgcrypto with schema extensions;

create table public.school_settings (
  id boolean primary key default true,
  display_name text not null,
  timezone text not null,
  access_code_hash text,
  parent_session_hours integer not null default 8,
  updated_at timestamptz not null default now(),
  constraint school_settings_singleton check (id),
  constraint school_settings_display_name_length check (char_length(display_name) between 1 and 120),
  constraint school_settings_timezone_present check (char_length(timezone) between 1 and 100),
  constraint school_settings_parent_session_hours_positive check (parent_session_hours > 0)
);

create table public.classes (
  id uuid primary key default extensions.gen_random_uuid(),
  title text not null,
  description text,
  teacher_name text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  zoom_url text not null,
  status text not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classes_title_length check (char_length(title) between 1 and 120),
  constraint classes_description_length check (description is null or char_length(description) <= 1000),
  constraint classes_teacher_name_length check (char_length(teacher_name) between 1 and 120),
  constraint classes_time_order check (ends_at > starts_at),
  constraint classes_zoom_url_https_zoom_host check (
    zoom_url ~* '^https://([a-z0-9-]+[.])*zoom[.]us(:[0-9]+)?([/?#].*)?$'
  ),
  constraint classes_status_allowed check (status in ('scheduled', 'canceled'))
);

create table public.parent_access_attempts (
  client_key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempt_count integer not null default 1,
  constraint parent_access_attempts_client_key_hash_length
    check (char_length(client_key_hash) between 1 and 255),
  constraint parent_access_attempts_attempt_count_positive check (attempt_count > 0)
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger school_settings_set_updated_at
before update on public.school_settings
for each row execute function public.set_updated_at();

create trigger classes_set_updated_at
before update on public.classes
for each row execute function public.set_updated_at();

create function public.consume_parent_access_attempt(
  p_client_key text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_allowed boolean;
begin
  if p_client_key is null or char_length(p_client_key) not between 1 and 255 then
    raise exception using
      errcode = '22023',
      message = 'p_client_key must contain between 1 and 255 characters';
  end if;

  if p_limit is null or p_limit <= 0 then
    raise exception using errcode = '22023', message = 'p_limit must be positive';
  end if;

  if p_window_seconds is null or p_window_seconds <= 0 then
    raise exception using errcode = '22023', message = 'p_window_seconds must be positive';
  end if;

  insert into public.parent_access_attempts as attempts (
    client_key_hash,
    window_started_at,
    attempt_count
  )
  values (p_client_key, v_now, 1)
  on conflict (client_key_hash) do update
  set
    window_started_at = case
      when attempts.window_started_at + make_interval(secs => p_window_seconds) <= v_now then v_now
      else attempts.window_started_at
    end,
    attempt_count = case
      when attempts.window_started_at + make_interval(secs => p_window_seconds) <= v_now then 1
      else attempts.attempt_count + 1
    end
  returning attempt_count <= p_limit into v_allowed;

  return v_allowed;
end;
$$;

alter table public.school_settings enable row level security;
alter table public.classes enable row level security;
alter table public.parent_access_attempts enable row level security;

revoke all on table public.school_settings from public, anon, authenticated;
revoke all on table public.classes from public, anon, authenticated;
revoke all on table public.parent_access_attempts from public, anon, authenticated;

grant all on table public.school_settings to service_role;
grant all on table public.classes to service_role;
grant all on table public.parent_access_attempts to service_role;

revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.consume_parent_access_attempt(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_parent_access_attempt(text, integer, integer) to service_role;

insert into public.school_settings (display_name, timezone)
values ('Class Calendar School', 'UTC');
