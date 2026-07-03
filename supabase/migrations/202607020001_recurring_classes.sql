alter table public.classes
  add column series_id uuid;

create index classes_series_id_starts_at_idx
  on public.classes (series_id, starts_at)
  where series_id is not null;
