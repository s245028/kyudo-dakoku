-- 的中の記録。1人・1日・区分ごとに1件で、書き込みは Edge Function だけがする。

alter table public.settings drop constraint settings_key_check;
alter table public.settings add constraint settings_key_check check (key in (
  'entranceQr', 'dojoLatitude', 'dojoLongitude', 'allowedDistanceMeters',
  'duplicateScanSeconds', 'undoSeconds', 'autoCheckoutTime', 'komaLocked',
  'noticeLeadMinutes', 'penaltyDoublingDays', 'hitStartDate'
));
insert into public.settings (key, value) values ('hitStartDate', 'null');

create sequence public.hit_revision as integer;

create table public.hit_records (
  member_id uuid not null references public.members (id) on delete cascade,
  practice_date date not null,
  category text not null check (category in ('standing', 'drill', 'self')),
  mode text not null check (mode in ('total', 'shots')),
  shots integer not null check (shots between 1 and 200),
  hits integer not null check (hits between 0 and shots),
  -- 一射ずつの記録の段。1は中り、0は外れ、null は未入力
  rows jsonb,
  revision integer not null,
  updated_at timestamptz not null,
  updated_by uuid references public.members (id) on delete set null,
  primary key (member_id, practice_date, category),
  check ((mode = 'shots') = (rows is not null))
);
create index hit_records_date on public.hit_records (practice_date);

-- 誰がいつ何を変えたか。before がなければ追加、after がなければ削除
create table public.hit_record_history (
  id integer generated always as identity primary key,
  member_id uuid not null references public.members (id) on delete cascade,
  practice_date date not null,
  category text not null,
  before jsonb,
  after jsonb,
  -- 空は、管理者ログインか、削除した部員
  changed_by uuid references public.members (id) on delete set null,
  changed_at timestamptz not null
);
create index hit_record_history_target
  on public.hit_record_history (member_id, practice_date, category, id);

alter table public.hit_records enable row level security;
alter table public.hit_record_history enable row level security;
revoke all on public.hit_records, public.hit_record_history from anon, authenticated;
revoke all on sequence public.hit_revision from anon, authenticated;
grant all on public.hit_records, public.hit_record_history to service_role;
grant usage on sequence public.hit_revision to service_role;
grant select on public.hit_records, public.hit_record_history to authenticated;

-- ほかの部員の記録を直せるか（管理者ログイン、副務、管理者の部員）
create function private.can_correct_hits() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and (role = 'vice' or is_admin)
  )
$$;
revoke all on function private.can_correct_hits() from public;
grant execute on function private.can_correct_hits() to authenticated, service_role;

-- 記録は承認済みの部員全員が読める。履歴は本人と、直せる人だけ
create policy hit_records_read on public.hit_records for select to authenticated
  using ((select private.is_approved_member()));
create policy hit_record_history_read on public.hit_record_history for select to authenticated
  using (
    ((select private.is_approved_member()) and member_id = (select private.current_member_id()))
    or (select private.can_correct_hits())
  );

-- 期間の記録を、部員と日ごとにまとめて返す。件数が多いので、短い配列にする
-- [部員, 日, 立ちの射数, 的中, 射込みの射数, 的中, 自練の射数, 的中]
create function public.hit_days(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_approved_member()) then (
    select coalesce(jsonb_agg(day.entry order by day.practice_date, day.member_id), '[]'::jsonb)
    from (
      select practice_date, member_id, jsonb_build_array(
        member_id, practice_date,
        coalesce(sum(shots) filter (where category = 'standing'), 0),
        coalesce(sum(hits) filter (where category = 'standing'), 0),
        coalesce(sum(shots) filter (where category = 'drill'), 0),
        coalesce(sum(hits) filter (where category = 'drill'), 0),
        coalesce(sum(shots) filter (where category = 'self'), 0),
        coalesce(sum(hits) filter (where category = 'self'), 0)
      ) as entry
      from public.hit_records
      where practice_date between p_from and p_to
      group by practice_date, member_id
    ) day
  ) else '[]'::jsonb end
$$;
revoke all on function public.hit_days(date, date) from public, anon, authenticated;
grant execute on function public.hit_days(date, date) to authenticated, service_role;

-- 記録が残っている人は、再登録の承認待ちでも名前を出す
create or replace function public.member_directory() returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when (select private.is_approved_member()) then (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'grade', m.grade, 'gender', m.gender, 'status', m.status
    ) order by m.student_no), '[]'::jsonb)
    from public.members m
    where m.approved
      or exists (select 1 from public.hit_records h where h.member_id = m.id)
  ) else '[]'::jsonb end
$$;

-- 画面に必要な設定に、的中の記録を始める日を足す
create or replace function private.client_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_object_agg(key, value) from public.settings
    where key in (
      'komaLocked', 'noticeLeadMinutes', 'penaltyDoublingDays', 'undoSeconds', 'hitStartDate'
    )
  ) || jsonb_build_object('requiresLocation', (
    select count(*) = 2 from public.settings
    where key in ('dojoLatitude', 'dojoLongitude') and value <> 'null'::jsonb
  ))
$$;

-- 記録が変わったら、開いている画面に知らせる（中身は送らず、読み直してもらう）
create function private.notify_hits_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'hits', true);
  return null;
end $$;

create trigger hit_records_notify
  after insert or update or delete on public.hit_records
  for each statement execute function private.notify_hits_changed();

create policy hits_notice_receive on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'hits'
  and (select private.is_approved_member())
);
