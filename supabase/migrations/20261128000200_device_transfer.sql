-- 部員登録を別の端末やブラウザに引き継ぐ番号。Edge Function だけが読み書きする。

create table public.device_transfers (
  member_id uuid primary key references public.members (id) on delete cascade,
  -- 番号そのものは残さない
  code_hash text not null,
  expires_at timestamptz not null,
  attempts integer not null default 0
);
alter table public.device_transfers enable row level security;
revoke all on public.device_transfers from anon, authenticated;
grant all on public.device_transfers to service_role;
