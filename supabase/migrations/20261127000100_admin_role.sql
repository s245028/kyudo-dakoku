-- 管理者：部員ではなく、メールアドレスとパスワードでログインして管理画面を使う開発用の権限。
-- この表への登録は SQL でだけ行う（README 参照）。本番では登録しない。

create table public.admins (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;
grant all on public.admins to service_role;

create function private.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.admins where auth_user_id = (select auth.uid()))
$$;
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to authenticated, service_role;

-- 管理者は、主将が読めるものをすべて読める
create or replace function private.is_approved_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired')
  )
$$;

create or replace function private.is_officer() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and role in ('captain', 'vice')
  )
$$;

create or replace function private.is_captain() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and role = 'captain'
  )
$$;

drop policy practice_rules_read on public.practice_rules;
create policy practice_rules_read on public.practice_rules for select to authenticated
  using (
    (select private.current_member_id()) is not null or (select private.is_admin())
  );

-- アプリの画面に必要な設定（入口QRと道場の位置は含めない）
create function private.client_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_object_agg(key, value) from public.settings
    where key in ('komaLocked', 'noticeLeadMinutes', 'penaltyDoublingDays', 'undoSeconds')
  ) || jsonb_build_object('requiresLocation', (
    select count(*) = 2 from public.settings
    where key in ('dojoLatitude', 'dojoLongitude') and value <> 'null'::jsonb
  ))
$$;
revoke all on function private.client_settings() from public, anon, authenticated;
grant execute on function private.client_settings() to service_role;

-- 管理者には、部員の代わりに isAdmin を返す
create or replace function private.home_snapshot(p_auth_user_id uuid, p_today date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select * from public.members where auth_user_id = p_auth_user_id
  )
  select case
  when exists (select 1 from public.admins where auth_user_id = p_auth_user_id)
    then jsonb_build_object(
      'member', null, 'isAdmin', true, 'settings', private.client_settings()
    )
  when not exists (select 1 from me) then jsonb_build_object('member', null)
  else jsonb_build_object(
    'member', (
      select jsonb_build_object(
        'id', id, 'studentNo', student_no, 'name', name, 'grade', grade, 'gender', gender,
        'status', status, 'role', role, 'approved', approved, 'retiredOn', retired_on
      ) from me
    ),
    'settings', private.client_settings(),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'weekday', weekday, 'condition', condition, 'part', part,
        'deadline', to_char(deadline, 'HH24:MI'), 'startTime', to_char(start_time, 'HH24:MI')
      )), '[]'::jsonb) from public.practice_rules
    ),
    'koma', (
      select jsonb_build_object(
        'mon4', mon4, 'mon5', mon5, 'tue4', tue4, 'tue5', tue5, 'thu4', thu4, 'thu5', thu5
      ) from public.koma where member_id = (select id from me)
    ),
    -- 参加を登録できる期間（今日から14日先）の、自分と全員の臨時変更
    'exceptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', date, 'memberId', member_id, 'kind', kind, 'memo', memo,
        'contactedAt', contacted_at
      ) order by date, created_at), '[]'::jsonb)
      from public.exceptions
      where date between p_today and p_today + 14
        and (member_id is null or member_id = (select id from me))
    ),
    'punches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'at', punched_at, 'kind', kind, 'canceledAt', canceled_at
      ) order by punched_at, id), '[]'::jsonb)
      from public.punches
      where member_id = (select id from me) and practice_date = p_today
    ),
    'penalties', (
      select case when approved and status in ('active', 'retired')
        then private.open_penalties(id) else '[]'::jsonb end
      from me
    )
  ) end
$$;
