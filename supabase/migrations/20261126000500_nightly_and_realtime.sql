-- 夜の自動処理、在室一覧の更新通知、一時停止対策

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- 夜の処理は1日1回だけ
create table public.nightly_runs (
  practice_date date primary key,
  ran_at timestamptz not null,
  checked_out integer not null default 0,
  judged integer not null default 0
);
alter table public.nightly_runs enable row level security;
revoke all on public.nightly_runs from anon, authenticated;
grant all on public.nightly_runs to service_role;
grant select on public.nightly_runs to authenticated;
create policy nightly_runs_read on public.nightly_runs for select to authenticated
  using ((select private.is_captain()));

-- 夜の処理を呼べるのはデータベースだけ。合言葉はここで作り、外に出さない
select vault.create_secret(
  encode(extensions.gen_random_bytes(32), 'hex'),
  'nightly_secret',
  '夜の自動処理の Edge Function を呼ぶときの合言葉'
);

-- 呼び出し先は環境ごとに違うので、Vault の nightly_url に入れる（README 参照）。未設定なら何もしない
create function private.call_nightly() returns void
language plpgsql security definer set search_path = '' as $$
declare
  target text;
  secret text;
begin
  select decrypted_secret into target from vault.decrypted_secrets where name = 'nightly_url';
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'nightly_secret';
  if target is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := target,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-nightly-secret', secret),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  delete from cron.job_run_details where end_time < now() - interval '7 days';
end $$;
revoke all on function private.call_nightly() from public, anon, authenticated, service_role;

-- 15分ごとに呼び、実行する時刻かどうかは Edge Function が設定を見て決める。失敗しても次の回でやり直せる
select cron.schedule('nightly', '*/15 * * * *', 'select private.call_nightly()');

-- 打刻が変わったら、在室一覧を開いている画面に知らせる（中身は送らず、読み直してもらう）
create function private.notify_presence_changed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.send('{}'::jsonb, 'changed', 'presence', true);
  return null;
end $$;

create trigger punches_notify_presence
  after insert or update on public.punches
  for each statement execute function private.notify_presence_changed();

create policy presence_notice_receive on realtime.messages for select to authenticated using (
  realtime.messages.extension = 'broadcast'
  and (select realtime.topic()) = 'presence'
  and (select private.is_approved_member())
);

-- 定期的に呼んで、無料プランの一時停止を防ぐ。何も読まない
create function public.ping() returns text
language sql stable set search_path = '' as $$
  select 'ok'
$$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated, service_role;
