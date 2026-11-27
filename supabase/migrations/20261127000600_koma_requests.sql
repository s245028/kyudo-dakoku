-- 部員がアプリから出す、その日だけのコマ変更の申請。連絡と同じく、主将が承認・却下する。

alter table public.exceptions
  drop constraint exceptions_approval_for_notices,
  add constraint exceptions_approval_for_requests check (
    approval is null
    or (member_id is not null
      and kind in ('absent_notice', 'late_notice', 'no_koma', 'koma4', 'koma5'))
  ),
  -- 申請する前の区分と集合時刻。却下したら、この時刻で判定する
  add column base_part text check (base_part in ('first', 'second', 'whole')),
  add column base_deadline time;
