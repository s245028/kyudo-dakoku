-- 役職に「管理者」を追加する。部員のまま、主将と同じ管理操作ができる。

alter table public.members drop constraint members_role_check;
alter table public.members add constraint members_role_check
  check (role in ('member', 'captain', 'vice', 'admin'));

create or replace function private.is_officer() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired')
      and role in ('captain', 'vice', 'admin')
  )
$$;

create or replace function private.is_captain() returns boolean
language sql stable security definer set search_path = '' as $$
  select (select private.is_admin()) or exists (
    select 1 from public.members
    where auth_user_id = (select auth.uid())
      and approved and status in ('active', 'retired') and role in ('captain', 'admin')
  )
$$;
