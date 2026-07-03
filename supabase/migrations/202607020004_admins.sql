create table public.admins (
  user_id uuid primary key,
  label text,
  created_at timestamptz not null default now(),
  constraint admins_label_length check (label is null or char_length(label) <= 120)
);

alter table public.admins enable row level security;

revoke all on table public.admins from public, anon, authenticated;

grant all on table public.admins to service_role;
