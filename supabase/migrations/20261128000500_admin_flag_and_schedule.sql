-- 「管理者」を役職と別の指定にする。予定を扱える人と集計を見られる人が読める範囲を足す。

alter table public.members add column is_admin boolean not null default false;
update public.members set is_admin = true, role = 'member' where role = 'admin';
alter table public.members drop constraint members_role_check;
alter table public.members add constraint members_role_check check (role in (
  'member', 'captain', 'men_vice_captain', 'women_vice_captain', 'chief_manager', 'vice',
  'treasurer'
));
grant select (is_admin) on public.members to authenticated;

create or replace function private.is_officer() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired')
      and (role in ('captain', 'vice') or is_admin)
  )
$$;

create or replace function private.is_captain() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and (role = 'captain' or is_admin)
  )
$$;

create or replace function private.is_lineup_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired')
      and (
        role in ('captain', 'men_vice_captain', 'women_vice_captain', 'chief_manager')
        or is_admin
      )
  )
$$;

-- 予定を扱う人（4役と管理者）は、役職の側が入れた予定を読める。部員の申請は理由があるので除く
create policy exceptions_schedule_read on public.exceptions for select to authenticated using (
  kind in ('day_off', 'no_koma', 'koma4', 'koma5') and approval is null
  and (select private.is_lineup_editor())
);

-- 部員の名前と、順位や集計の区別に使う内容。学生番号は含めない
create function public.member_directory() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_approved_member()) then (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', id, 'name', name, 'grade', grade, 'gender', gender, 'status', status
    ) order by student_no), '[]'::jsonb)
    from public.members where approved
  ) else '[]'::jsonb end
$$;
revoke all on function public.member_directory() from public, anon, authenticated;
grant execute on function public.member_directory() to authenticated, service_role;

create or replace function public.lineup_day() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_lineup_editor()) then jsonb_build_object(
    'date', private.practice_today(),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'studentNo', student_no, 'name', name, 'grade', grade, 'gender', gender,
        'status', status, 'role', role, 'isAdmin', is_admin, 'approved', approved,
        'retiredOn', retired_on
      ) order by student_no), '[]'::jsonb)
      from public.members where approved and status in ('active', 'retired')
    ),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'weekday', weekday, 'condition', condition, 'part', part,
        'deadline', to_char(deadline, 'HH24:MI'), 'startTime', to_char(start_time, 'HH24:MI'),
        'endTime', to_char(end_time, 'HH24:MI')
      )), '[]'::jsonb) from public.practice_rules
    ),
    'koma', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'memberId', member_id, 'mon4', mon4, 'mon5', mon5, 'tue4', tue4, 'tue5', tue5,
        'thu4', thu4, 'thu5', thu5
      )), '[]'::jsonb) from public.koma
    ),
    'exceptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', date, 'memberId', member_id, 'kind', kind, 'approval', approval
      ) order by created_at, id), '[]'::jsonb)
      from public.exceptions where date = private.practice_today()
    ),
    'punches', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'memberId', member_id, 'at', punched_at, 'kind', kind, 'canceledAt', canceled_at
      ) order by punched_at, id), '[]'::jsonb)
      from public.punches where practice_date = private.practice_today()
    ),
    'lineups', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'part', l.part, 'format', l.format, 'groups', l.groups, 'published', l.published,
        'updatedAt', l.updated_at, 'updatedBy', m.name
      )), '[]'::jsonb)
      from public.lineups l
      left join public.members m on m.id = l.updated_by
      where l.practice_date = private.practice_today()
    )
  ) end
$$;

create or replace function private.home_snapshot(p_auth_user_id uuid, p_today date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select * from public.members where auth_user_id = p_auth_user_id
  )
  select case
  when exists (select 1 from public.admins where auth_user_id = p_auth_user_id)
    then jsonb_build_object(
      'member', null, 'isAdmin', true, 'settings', private.client_settings(),
      'pendingNotices', private.pending_notice_count(),
      'pendingMembers', private.pending_member_count()
    )
  when not exists (select 1 from me) then jsonb_build_object('member', null)
  else jsonb_build_object(
    'member', (
      select jsonb_build_object(
        'id', id, 'studentNo', student_no, 'name', name, 'grade', grade, 'gender', gender,
        'status', status, 'role', role, 'isAdmin', is_admin, 'approved', approved,
        'retiredOn', retired_on
      ) from me
    ),
    'settings', private.client_settings(),
    'rules', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'weekday', weekday, 'condition', condition, 'part', part,
        'deadline', to_char(deadline, 'HH24:MI'), 'startTime', to_char(start_time, 'HH24:MI'),
        'endTime', to_char(end_time, 'HH24:MI')
      )), '[]'::jsonb) from public.practice_rules
    ),
    'koma', (
      select jsonb_build_object(
        'mon4', mon4, 'mon5', mon5, 'tue4', tue4, 'tue5', tue5, 'thu4', thu4, 'thu5', thu5
      ) from public.koma where member_id = (select id from me)
    ),
    -- 参加の登録と連絡ができる期間（今日から14日先）の、自分と全員の臨時変更
    'exceptions', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'date', date, 'memberId', member_id, 'kind', kind, 'memo', memo,
        'contactedAt', contacted_at, 'approval', approval,
        'rejectionReason', rejection_reason,
        'selfSubmitted', coalesce(created_by = member_id, false)
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
    ),
    'pendingNotices', (
      select case when approved and status in ('active', 'retired')
          and (role = 'captain' or is_admin)
        then private.pending_notice_count() else 0 end
      from me
    ),
    'pendingMembers', (
      select case when approved and status in ('active', 'retired')
          and (role = 'captain' or is_admin)
        then private.pending_member_count() else 0 end
      from me
    )
  ) end
$$;
