create table public.reminder_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  email text not null unique,
  unsubscribe_token text not null unique,
  created_at timestamptz not null default now(),
  constraint reminder_subscriptions_email_format check (
    char_length(email) between 3 and 320 and position('@' in email) > 1
  ),
  constraint reminder_subscriptions_token_length check (
    char_length(unsubscribe_token) between 32 and 128
  )
);

create table public.reminder_digests (
  digest_date date primary key,
  sent_at timestamptz not null default now()
);

alter table public.reminder_subscriptions enable row level security;
alter table public.reminder_digests enable row level security;

revoke all on table public.reminder_subscriptions from public, anon, authenticated;
revoke all on table public.reminder_digests from public, anon, authenticated;

grant all on table public.reminder_subscriptions to service_role;
grant all on table public.reminder_digests to service_role;
