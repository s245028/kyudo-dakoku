-- 役職に男子副将・女子副将・主務・会計を追加する。権限は部員と同じ。

alter table public.members drop constraint members_role_check;
alter table public.members add constraint members_role_check check (role in (
  'member', 'captain', 'men_vice_captain', 'women_vice_captain', 'chief_manager', 'vice',
  'treasurer', 'admin'
));
