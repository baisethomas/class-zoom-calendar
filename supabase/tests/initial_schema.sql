begin;

create extension if not exists pgtap with schema extensions;

select no_plan();

select has_extension('pgcrypto', 'pgcrypto is enabled');

select has_table('public', 'school_settings', 'school_settings exists');
select has_table('public', 'classes', 'classes exists');
select has_table('public', 'parent_access_attempts', 'parent_access_attempts exists');

select columns_are(
  'public',
  'school_settings',
  array['id', 'display_name', 'timezone', 'access_code_hash', 'parent_session_hours', 'updated_at'],
  'school_settings has exactly the required columns'
);
select columns_are(
  'public',
  'classes',
  array['id', 'title', 'description', 'teacher_name', 'starts_at', 'ends_at', 'zoom_url', 'status', 'created_at', 'updated_at'],
  'classes has exactly the required columns'
);
select columns_are(
  'public',
  'parent_access_attempts',
  array['client_key_hash', 'window_started_at', 'attempt_count'],
  'parent_access_attempts has exactly the required columns'
);

with expected(table_name, column_name, data_type, is_nullable, has_default) as (
  values
    ('school_settings', 'id', 'boolean', 'NO', true),
    ('school_settings', 'display_name', 'text', 'NO', false),
    ('school_settings', 'timezone', 'text', 'NO', false),
    ('school_settings', 'access_code_hash', 'text', 'YES', false),
    ('school_settings', 'parent_session_hours', 'integer', 'NO', true),
    ('school_settings', 'updated_at', 'timestamp with time zone', 'NO', true),
    ('classes', 'id', 'uuid', 'NO', true),
    ('classes', 'title', 'text', 'NO', false),
    ('classes', 'description', 'text', 'YES', false),
    ('classes', 'teacher_name', 'text', 'NO', false),
    ('classes', 'starts_at', 'timestamp with time zone', 'NO', false),
    ('classes', 'ends_at', 'timestamp with time zone', 'NO', false),
    ('classes', 'zoom_url', 'text', 'NO', false),
    ('classes', 'status', 'text', 'NO', true),
    ('classes', 'created_at', 'timestamp with time zone', 'NO', true),
    ('classes', 'updated_at', 'timestamp with time zone', 'NO', true),
    ('parent_access_attempts', 'client_key_hash', 'text', 'NO', false),
    ('parent_access_attempts', 'window_started_at', 'timestamp with time zone', 'NO', true),
    ('parent_access_attempts', 'attempt_count', 'integer', 'NO', true)
)
select is(
  (select c.data_type::text
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = expected.table_name
     and c.column_name = expected.column_name),
  expected.data_type,
  format('%I.%I has the required type', expected.table_name, expected.column_name)
)
from expected;

with expected(table_name, column_name, is_nullable, has_default) as (
  values
    ('school_settings', 'id', 'NO', true),
    ('school_settings', 'display_name', 'NO', false),
    ('school_settings', 'timezone', 'NO', false),
    ('school_settings', 'access_code_hash', 'YES', false),
    ('school_settings', 'parent_session_hours', 'NO', true),
    ('school_settings', 'updated_at', 'NO', true),
    ('classes', 'id', 'NO', true),
    ('classes', 'title', 'NO', false),
    ('classes', 'description', 'YES', false),
    ('classes', 'teacher_name', 'NO', false),
    ('classes', 'starts_at', 'NO', false),
    ('classes', 'ends_at', 'NO', false),
    ('classes', 'zoom_url', 'NO', false),
    ('classes', 'status', 'NO', true),
    ('classes', 'created_at', 'NO', true),
    ('classes', 'updated_at', 'NO', true),
    ('parent_access_attempts', 'client_key_hash', 'NO', false),
    ('parent_access_attempts', 'window_started_at', 'NO', true),
    ('parent_access_attempts', 'attempt_count', 'NO', true)
)
select is(
  (select c.is_nullable::text
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = expected.table_name
     and c.column_name = expected.column_name),
  expected.is_nullable,
  format('%I.%I has the required nullability', expected.table_name, expected.column_name)
)
from expected
union all
select is(
  (select (c.column_default is not null)
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = expected.table_name
     and c.column_name = expected.column_name),
  expected.has_default,
  format('%I.%I has the required default presence', expected.table_name, expected.column_name)
)
from expected;

with expected(table_name, column_name, column_default) as (
  values
    ('school_settings', 'id', 'true'),
    ('school_settings', 'parent_session_hours', '8'),
    ('school_settings', 'updated_at', 'now()'),
    ('classes', 'status', '''scheduled''::text'),
    ('classes', 'created_at', 'now()'),
    ('classes', 'updated_at', 'now()'),
    ('parent_access_attempts', 'window_started_at', 'now()'),
    ('parent_access_attempts', 'attempt_count', '1')
)
select is(
  (select c.column_default::text
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = expected.table_name
     and c.column_name = expected.column_name),
  expected.column_default,
  format('%I.%I has the required default value', expected.table_name, expected.column_name)
)
from expected;
select ok(
  (select c.column_default like '%gen_random_uuid()'
   from information_schema.columns c
   where c.table_schema = 'public'
     and c.table_name = 'classes'
     and c.column_name = 'id'),
  'classes.id defaults to a generated UUID'
);

with expected(constraint_name, constraint_type) as (
  values
    ('school_settings_pkey', 'p'),
    ('school_settings_singleton', 'c'),
    ('school_settings_display_name_length', 'c'),
    ('school_settings_timezone_present', 'c'),
    ('school_settings_parent_session_hours_positive', 'c'),
    ('classes_pkey', 'p'),
    ('classes_title_length', 'c'),
    ('classes_description_length', 'c'),
    ('classes_teacher_name_length', 'c'),
    ('classes_time_order', 'c'),
    ('classes_zoom_url_https_zoom_host', 'c'),
    ('classes_status_allowed', 'c'),
    ('parent_access_attempts_pkey', 'p'),
    ('parent_access_attempts_client_key_hash_length', 'c'),
    ('parent_access_attempts_attempt_count_positive', 'c')
)
select is(
  (select c.contype::text
   from pg_constraint c
   where c.connamespace = 'public'::regnamespace
     and c.conname = expected.constraint_name),
  expected.constraint_type,
  format('%I exists with the required constraint type', expected.constraint_name)
)
from expected;

select ok(
  (select relrowsecurity from pg_class where oid = 'public.school_settings'::regclass),
  'school_settings has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.classes'::regclass),
  'classes has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.parent_access_attempts'::regclass),
  'parent_access_attempts has RLS enabled'
);
select is(
  (select count(*)::integer from pg_policies where schemaname = 'public' and tablename in ('school_settings', 'classes', 'parent_access_attempts')),
  0,
  'calendar tables expose no RLS policies'
);

select ok(
  not has_table_privilege(role_name, format('public.%I', table_name), privilege_name),
  format('%I is denied %s on public.%I', role_name, privilege_name, table_name)
)
from unnest(array['anon', 'authenticated']) as roles(role_name)
cross join unnest(array['school_settings', 'classes', 'parent_access_attempts']) as tables(table_name)
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as privileges(privilege_name);

select has_function(
  'public',
  'consume_parent_access_attempt',
  array['text', 'integer', 'integer'],
  'rate-limit function exists'
);
select has_function('public', 'set_updated_at', array[]::text[], 'timestamp trigger function exists');
select ok(
  not has_function_privilege(role_name, functions.oid, 'execute'),
  format('%I cannot execute public.%s', role_name, functions.identity)
)
from unnest(array['anon', 'authenticated']) as roles(role_name)
cross join (
  select p.oid, p.oid::regprocedure::text as identity
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
) as functions;
select is(
  has_function_privilege('service_role', functions.oid, 'execute'),
  functions.oid = 'public.consume_parent_access_attempt(text, integer, integer)'::regprocedure,
  format('service_role execute privilege is correct for public.%s', functions.identity)
)
from (
  select p.oid, p.oid::regprocedure::text as identity
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
) as functions;
select is(
  (select prosecdef from pg_proc where oid = 'public.consume_parent_access_attempt(text, integer, integer)'::regprocedure),
  true,
  'rate-limit function is security definer'
);
select is(
  (select proconfig from pg_proc where oid = 'public.consume_parent_access_attempt(text, integer, integer)'::regprocedure),
  array['search_path=pg_catalog'],
  'rate-limit function fixes its search path to trusted objects only'
);

select is((select id from public.school_settings), true, 'school settings singleton id defaults to true');
select is((select display_name from public.school_settings), 'Class Calendar School', 'school settings row is seeded for first-run setup');
select is((select timezone from public.school_settings), 'UTC', 'school settings seed uses UTC until the administrator changes it');
select is((select parent_session_hours from public.school_settings), 8, 'parent session duration has a conservative default');
select is((select access_code_hash from public.school_settings), null::text, 'access code hash may initially be null');

select throws_ok(
  $$insert into public.school_settings (display_name, timezone) values ('Second School', 'UTC')$$,
  '23505',
  null,
  'school settings is a singleton'
);
select throws_ok(
  $$insert into public.school_settings (display_name, timezone, parent_session_hours) values ('Bad Hours', 'UTC', 0)$$,
  '23514',
  null,
  'parent session duration must be positive'
);
select throws_ok(
  $$update public.school_settings set display_name = ''$$,
  '23514', null, 'empty school display name is rejected'
);
select throws_ok(
  $$update public.school_settings set timezone = ''$$,
  '23514', null, 'empty timezone is rejected'
);

update public.school_settings
set display_name = 'Example School',
    timezone = 'America/Los_Angeles',
    updated_at = now() - interval '1 hour';

select lives_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url, updated_at) values ('Math', 'Ms. Ada', now(), now() + interval '1 hour', 'https://zoom.us/j/123', now() - interval '1 hour')$$,
  'zoom.us URL is accepted'
);
select ok((select id is not null from public.classes where title = 'Math'), 'class id defaults to a UUID');
select is((select status from public.classes where title = 'Math'), 'scheduled', 'class status defaults to scheduled');
select ok((select created_at is not null from public.classes where title = 'Math'), 'class creation timestamp has a default');
select lives_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Science', 'Dr. Lin', now(), now() + interval '1 hour', 'https://us02web.zoom.us/j/456?pwd=abc')$$,
  'Zoom subdomain URL is accepted'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Bad URL', 'Teacher', now(), now() + interval '1 hour', 'http://zoom.us/j/1')$$,
  '23514', null, 'HTTP Zoom URL is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Bad URL', 'Teacher', now(), now() + interval '1 hour', 'https://zoom.us.evil.example/j/1')$$,
  '23514', null, 'deceptive Zoom suffix is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Bad URL', 'Teacher', now(), now() + interval '1 hour', 'https://example.com/j/1')$$,
  '23514', null, 'non-Zoom host is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('', 'Teacher', now(), now() + interval '1 hour', 'https://zoom.us/j/1')$$,
  '23514', null, 'empty class title is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values (repeat('x', 121), 'Teacher', now(), now() + interval '1 hour', 'https://zoom.us/j/1')$$,
  '23514', null, 'class title longer than 120 characters is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, description, starts_at, ends_at, zoom_url) values ('Class', 'Teacher', repeat('x', 1001), now(), now() + interval '1 hour', 'https://zoom.us/j/1')$$,
  '23514', null, 'description longer than 1000 characters is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Class', '', now(), now() + interval '1 hour', 'https://zoom.us/j/1')$$,
  '23514', null, 'empty teacher name is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Class', repeat('x', 121), now(), now() + interval '1 hour', 'https://zoom.us/j/1')$$,
  '23514', null, 'teacher name longer than 120 characters is rejected'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url) values ('Class', 'Teacher', now(), now(), 'https://zoom.us/j/1')$$,
  '23514', null, 'class end must follow its start'
);
select throws_ok(
  $$insert into public.classes (title, teacher_name, starts_at, ends_at, zoom_url, status) values ('Class', 'Teacher', now(), now() + interval '1 hour', 'https://zoom.us/j/1', 'finished')$$,
  '23514', null, 'unknown class status is rejected'
);

select is(public.consume_parent_access_attempt(repeat('a', 64), 2, 60), true, 'first attempt is allowed');
select is(public.consume_parent_access_attempt(repeat('a', 64), 2, 60), true, 'attempt at limit is allowed');
select is(public.consume_parent_access_attempt(repeat('a', 64), 2, 60), false, 'attempt over limit is denied');
select is(
  (select attempt_count from public.parent_access_attempts where client_key_hash = repeat('a', 64)),
  3,
  'active-window attempts increment atomically'
);
update public.parent_access_attempts
set window_started_at = now() - interval '61 seconds'
where client_key_hash = repeat('a', 64);
select is(public.consume_parent_access_attempt(repeat('a', 64), 2, 60), true, 'expired window resets and allows an attempt');
select is(
  (select attempt_count from public.parent_access_attempts where client_key_hash = repeat('a', 64)),
  1,
  'expired window resets attempt count'
);
select throws_ok(
  $$select public.consume_parent_access_attempt(repeat('b', 64), 0, 60)$$,
  '22023', null, 'non-positive limit is rejected'
);
select throws_ok(
  $$select public.consume_parent_access_attempt(repeat('b', 64), 2, 0)$$,
  '22023', null, 'non-positive window is rejected'
);
select throws_ok(
  $$select public.consume_parent_access_attempt('', 2, 60)$$,
  '22023', null, 'empty client key is rejected'
);
select throws_ok(
  $$insert into public.parent_access_attempts (client_key_hash) values ('')$$,
  '23514', null, 'empty client key hash is rejected'
);
select throws_ok(
  $$insert into public.parent_access_attempts (client_key_hash) values (repeat('x', 256))$$,
  '23514', null, 'oversized client key hash is rejected'
);
select throws_ok(
  $$insert into public.parent_access_attempts (client_key_hash, attempt_count) values ('negative-count', 0)$$,
  '23514', null, 'non-positive stored attempt count is rejected'
);
insert into public.parent_access_attempts (client_key_hash) values ('default-count');
select is(
  (select attempt_count from public.parent_access_attempts where client_key_hash = 'default-count'),
  1,
  'stored attempt count defaults to one'
);
select ok(
  (select window_started_at is not null from public.parent_access_attempts where client_key_hash = 'default-count'),
  'rate-limit window start has a default'
);

update public.school_settings set display_name = 'Updated School';
select ok(
  (select updated_at > now() - interval '1 minute' from public.school_settings),
  'school settings update trigger refreshes updated_at'
);
update public.classes set title = 'Updated Math' where title = 'Math';
select ok(
  (select updated_at > now() - interval '1 minute' from public.classes where title = 'Updated Math'),
  'class update trigger refreshes updated_at'
);

select is(
  (select count(*)::integer from pg_trigger where tgrelid = 'public.school_settings'::regclass and not tgisinternal),
  1,
  'school settings has an update timestamp trigger'
);
select is(
  (select count(*)::integer from pg_trigger where tgrelid = 'public.classes'::regclass and not tgisinternal),
  1,
  'classes has an update timestamp trigger'
);

select * from finish();
rollback;
