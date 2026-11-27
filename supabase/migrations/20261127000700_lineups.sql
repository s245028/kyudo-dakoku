-- 立ち順。当日分だけを残し、翌日の夜の処理で消す。

create table public.lineups (
  practice_date date not null,
  part text not null check (part in ('first', 'second', 'whole')),
  format text not null check (format in ('targets', 'groups')),
  -- 列（的か立ち）ごとの部員の id の配列
  groups jsonb not null,
  published boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.members (id),
  primary key (practice_date, part)
);
alter table public.lineups enable row level security;
revoke all on public.lineups from anon, authenticated;
grant all on public.lineups to service_role;
grant select on public.lineups to authenticated;
-- 表を直接読めるのは主将と管理者だけ。部員は公開したものを関数で読む
create policy lineups_read on public.lineups for select to authenticated
  using ((select private.is_captain()));

-- 今日の公開した立ち順を、名前つきで返す
create function public.published_lineups() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'part', l.part,
      'format', l.format,
      'groups', (
        select jsonb_agg((
          select coalesce(
            jsonb_agg(jsonb_build_object('id', m.id, 'name', m.name) order by slot.position),
            '[]'::jsonb
          )
          from jsonb_array_elements_text(col.members) with ordinality slot (id, position)
          join public.members m on m.id = slot.id::uuid
        ) order by col.position)
        from jsonb_array_elements(l.groups) with ordinality col (members, position)
      )
    ) order by case l.part when 'first' then 1 when 'second' then 2 else 3 end
  ), '[]'::jsonb)
  from public.lineups l
  where l.published and l.practice_date = private.practice_today()
    and (select private.is_approved_member())
$$;
revoke all on function public.published_lineups() from public, anon, authenticated;
grant execute on function public.published_lineups() to authenticated, service_role;
