-- 部員を削除して打刻が消えたときも、在室一覧を開いている画面に知らせる
drop trigger punches_notify_presence on public.punches;
create trigger punches_notify_presence
  after insert or update or delete on public.punches
  for each statement execute function private.notify_presence_changed();
