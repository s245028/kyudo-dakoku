-- 練習の終了の時刻。これより後の入室は欠席として判定する。決めていないルールは今までどおり。
alter table public.practice_rules
  add column end_time time check (end_time > start_time);

create or replace function public.lineup_day() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_lineup_editor()) then jsonb_build_object(
    'date', private.practice_today(),
    'members', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'studentNo', student_no, 'name', name, 'grade', grade, 'gender', gender,
        'status', status, 'role', role, 'approved', approved, 'retiredOn', retired_on
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
        'status', status, 'role', role, 'approved', approved, 'retiredOn', retired_on
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
          and role in ('captain', 'admin')
        then private.pending_notice_count() else 0 end
      from me
    ),
    'pendingMembers', (
      select case when approved and status in ('active', 'retired')
          and role in ('captain', 'admin')
        then private.pending_member_count() else 0 end
      from me
    )
  ) end
$$;
