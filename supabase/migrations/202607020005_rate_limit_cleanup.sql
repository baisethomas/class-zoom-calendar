-- Prune stale rate-limit rows opportunistically so the table stays small.
create or replace function public.consume_parent_access_attempt(
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

  delete from public.parent_access_attempts
  where window_started_at
    < v_now - make_interval(secs => p_window_seconds) - interval '1 day';

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
