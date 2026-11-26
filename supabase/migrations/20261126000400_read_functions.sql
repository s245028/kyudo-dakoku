-- アプリが読むための関数。表を直接読むと名前が分からない・何度も問い合わせる、という部分をまとめる。

create function private.practice_today() returns date
language sql stable set search_path = '' as $$
  select (now() at time zone 'Asia/Tokyo')::date
$$;

-- 未消化の罰とやること。p_member_id が null なら全員。残りの数はアプリ側（core）で計算する。
create function private.open_penalties(p_member_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'date', p.practice_date,
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

-- ホーム画面に必要なものを1回で返す。登録していない端末には member が null。
create function private.home_snapshot(p_auth_user_id uuid, p_today date) returns jsonb
language sql stable security definer set search_path = '' as $$
  with me as (
    select * from public.members where auth_user_id = p_auth_user_id
  )
  select case when not exists (select 1 from me) then jsonb_build_object('member', null)
  else jsonb_build_object(
    'member', (
      select jsonb_build_object(
        'id', id, 'studentNo', student_no, 'name', name, 'grade', grade, 'gender', gender,
        'status', status, 'role', role, 'approved', approved, 'retiredOn', retired_on
      ) from me
    ),
    'settings', (
      select jsonb_object_agg(key, value) from public.settings
      where key in ('komaLocked', 'noticeLeadMinutes', 'penaltyDoublingDays', 'undoSeconds')
    ) || jsonb_build_object('requiresLocation', (
      select count(*) = 2 from public.settings
      where key in ('dojoLatitude', 'dojoLongitude') and value <> 'null'::jsonb
    )),
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

create function public.home() returns jsonb
language sql stable security definer set search_path = '' as $$
  select private.home_snapshot((select auth.uid()), private.practice_today())
$$;

-- いま道場にいる人。今日の、取り消されていない最後の打刻が入室の人。
create function public.presence() returns table (member_id uuid, name text, since timestamptz)
language sql stable security definer set search_path = '' as $$
  select latest.member_id, m.name, latest.punched_at
  from (
    select distinct on (p.member_id) p.member_id, p.punched_at, p.kind
    from public.punches p
    where p.practice_date = private.practice_today() and p.canceled_at is null
    order by p.member_id, p.punched_at desc, p.id desc
  ) latest
  join public.members m on m.id = latest.member_id
  where latest.kind = 'in' and (select private.is_approved_member())
  order by latest.punched_at, m.name
$$;

create function public.penalty_board() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_approved_member())
    then private.open_penalties(null) else '[]'::jsonb end
$$;

revoke all on function
  private.practice_today(), private.open_penalties(uuid), private.home_snapshot(uuid, date)
from public, anon, authenticated;
grant execute on function
  private.practice_today(), private.open_penalties(uuid), private.home_snapshot(uuid, date)
to service_role;

revoke all on function public.home(), public.presence(), public.penalty_board()
from public, anon, authenticated;
grant execute on function public.home(), public.presence(), public.penalty_board()
to authenticated, service_role;
