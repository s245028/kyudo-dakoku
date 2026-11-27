-- 部員がアプリから出す欠席・遅刻の連絡と、主将の承認。

alter table public.exceptions
  -- 締め切りまでにアプリから出した連絡だけが持つ。主将の入力と締め切り後の連絡は null
  add column approval text check (approval in ('pending', 'approved', 'rejected')),
  add column rejection_reason text not null default ''
    check (char_length(rejection_reason) <= 200),
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.members (id),
  add constraint exceptions_approval_for_notices
    check (approval is null or kind in ('absent_notice', 'late_notice'));
create index exceptions_pending_idx on public.exceptions (date) where approval = 'pending';

alter table public.attendance drop constraint attendance_auto_result_check;
alter table public.attendance add constraint attendance_auto_result_check check (auto_result in (
  'present', 'late', 'late_notified', 'late_notice_overdue', 'absent_unexcused',
  'absent_notified', 'absent_notice_overdue', 'exempt', 'late_pending', 'absent_pending',
  'not_arrived', 'unregistered'
));

-- 却下が遅れた罰は、倍になる日数を却下した日から数える。null なら practice_date から
alter table public.penalties add column counted_from date;

create or replace function private.open_penalties(p_member_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'date', p.practice_date,
      'countedFrom', p.counted_from,
      'memberId', p.member_id,
      'name', m.name,
      'studentNo', m.student_no,
      'reason', p.reason,
      'memo', p.memo,
      'baseCount', p.base_count,
      'tasks', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', t.id,
            'content', t.content,
            'completedOn', (t.done_at at time zone 'Asia/Tokyo')::date
          ) order by t.assigned_at, t.id
        )
        from public.penalty_tasks t where t.penalty_id = p.id
      ), '[]'::jsonb)
    ) order by p.practice_date, p.created_at, p.id
  ), '[]'::jsonb)
  from public.penalties p
  join public.members m on m.id = p.member_id
  where p.completed_on is null and (p_member_id is null or p.member_id = p_member_id)
$$;

-- 承認を待っている連絡の数
create function private.pending_notice_count() returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::integer from public.exceptions where approval = 'pending'
$$;
revoke all on function private.pending_notice_count() from public, anon, authenticated;
grant execute on function private.pending_notice_count() to service_role;

-- 連絡の状態と、主将と管理者には承認待ちの数を返す
create or replace function private.home_snapshot(p_auth_user_id uuid, p_today date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select * from public.members where auth_user_id = p_auth_user_id
  )
  select case
  when exists (select 1 from public.admins where auth_user_id = p_auth_user_id)
    then jsonb_build_object(
      'member', null, 'isAdmin', true, 'settings', private.client_settings(),
      'pendingNotices', private.pending_notice_count()
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
    )
  ) end
$$;
