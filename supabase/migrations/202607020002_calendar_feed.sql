alter table public.school_settings
  add column calendar_feed_token text;

alter table public.school_settings
  add constraint school_settings_feed_token_length check (
    calendar_feed_token is null or char_length(calendar_feed_token) between 32 and 128
  );
