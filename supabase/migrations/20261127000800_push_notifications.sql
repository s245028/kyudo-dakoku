-- 通知（Web Push）。どちらの表も Edge Function だけが読み書きする。

-- 通知を受け取る端末。ログイン（匿名ログインか管理者）ごとに持つ
create table public.push_subscriptions (
  endpoint text primary key,
  auth_user_id uuid not null references auth.users (id) on delete cascade,
  p256dh text not null,
  auth_secret text not null,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (auth_user_id);
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;
grant all on public.push_subscriptions to service_role;

-- 通知の送信に使う鍵。最初に使うときに作る。1行だけ
create table public.push_keys (
  id boolean primary key default true check (id),
  public_key text not null,
  private_key text not null
);
alter table public.push_keys enable row level security;
revoke all on public.push_keys from anon, authenticated;
grant all on public.push_keys to service_role;
