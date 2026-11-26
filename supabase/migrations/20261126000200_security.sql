-- 権限。アプリは読むだけで、書き込みはすべて Edge Functions を通す。

-- API に公開しないスキーマに、権限の判定に使う関数を置く
create schema private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ログイン中の端末に結びついた部員
create function private.current_member_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select id from public.members where auth_user_id = (select auth.uid())
$$;

-- 承認済みで在籍中（現役・引退）の部員か
create function private.is_approved_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired')
  )
$$;

-- 主将・副務か
create function private.is_officer() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and role in ('captain', 'vice')
  )
$$;

create function private.is_captain() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and role = 'captain'
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'settings', 'practice_rules', 'members', 'koma', 'exceptions', 'punches', 'attendance',
    'penalty_types', 'penalties', 'penalty_tasks', 'grade_promotions'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant all on public.%I to service_role', table_name);
  end loop;
end $$;

grant select on
  public.settings, public.practice_rules, public.koma, public.exceptions, public.punches,
  public.attendance, public.penalty_types, public.penalties, public.penalty_tasks,
  public.grade_promotions
to authenticated;
-- auth_user_id はアプリに見せない
grant select (
  id, student_no, name, grade, gender, status, role, approved, retired_on, linked, registered_at
) on public.members to authenticated;

-- 入口QRは主将だけ。ほかの設定は登録した部員が読める
create policy settings_read on public.settings for select to authenticated using (
  (select private.is_captain())
  or (key <> 'entranceQr' and (select private.current_member_id()) is not null)
);

create policy practice_rules_read on public.practice_rules for select to authenticated
  using ((select private.current_member_id()) is not null);

-- 本人と主将・副務だけが読める表
create policy members_read on public.members for select to authenticated
  using (id = (select private.current_member_id()) or (select private.is_officer()));

create policy koma_read on public.koma for select to authenticated
  using (member_id = (select private.current_member_id()) or (select private.is_officer()));

create policy exceptions_read on public.exceptions for select to authenticated using (
  member_id = (select private.current_member_id())
  or (member_id is null and (select private.current_member_id()) is not null)
  or (select private.is_officer())
);

create policy punches_read on public.punches for select to authenticated
  using (member_id = (select private.current_member_id()) or (select private.is_officer()));

create policy attendance_read on public.attendance for select to authenticated
  using (member_id = (select private.current_member_id()) or (select private.is_officer()));

-- 承認済みの部員は、全員の罰とやることを読める
create policy penalty_types_read on public.penalty_types for select to authenticated
  using ((select private.is_approved_member()));

create policy penalties_read on public.penalties for select to authenticated
  using ((select private.is_approved_member()));

create policy penalty_tasks_read on public.penalty_tasks for select to authenticated
  using ((select private.is_approved_member()));

create policy grade_promotions_read on public.grade_promotions for select to authenticated
  using ((select private.is_captain()));
