-- 上4役（主将・男子副将・女子副将・主務）の罰は、1回あたりの数を倍にする。倍率は設定で変える。

alter table public.penalties
  add column multiplier integer not null default 1 check (multiplier between 1 and 10);
-- 倍率をかけた数まで入るようにする
alter table public.penalties drop constraint penalties_base_count_check;
alter table public.penalties add constraint penalties_base_count_check
  check (base_count between 1 and 200);

alter table public.settings drop constraint settings_key_check;
alter table public.settings add constraint settings_key_check check (key in (
  'entranceQr', 'dojoLatitude', 'dojoLongitude', 'allowedDistanceMeters',
  'duplicateScanSeconds', 'undoSeconds', 'autoCheckoutTime', 'komaLocked',
  'noticeLeadMinutes', 'penaltyDoublingDays', 'hitStartDate', 'leaderPenaltyMultiplier'
));
insert into public.settings (key, value) values ('leaderPenaltyMultiplier', '2');

create or replace function private.client_settings() returns jsonb
language sql stable security definer set search_path = '' as $$
  select (
    select jsonb_object_agg(key, value) from public.settings
    where key in (
      'komaLocked', 'noticeLeadMinutes', 'penaltyDoublingDays', 'undoSeconds', 'hitStartDate',
      'leaderPenaltyMultiplier'
    )
  ) || jsonb_build_object('requiresLocation', (
    select count(*) = 2 from public.settings
    where key in ('dojoLatitude', 'dojoLongitude') and value <> 'null'::jsonb
  ))
$$;
