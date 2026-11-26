-- 表の定義。列の値の意味は packages/core の型と合わせる。

create table public.settings (
  key text primary key check (key in (
    'entranceQr', 'dojoLatitude', 'dojoLongitude', 'allowedDistanceMeters',
    'duplicateScanSeconds', 'undoSeconds', 'autoCheckoutTime', 'komaLocked',
    'noticeLeadMinutes', 'penaltyDoublingDays'
  )),
  value jsonb not null
);

create table public.practice_rules (
  id uuid primary key default gen_random_uuid(),
  weekday smallint not null check (weekday between 0 and 6),
  condition text not null check (condition in ('all', 'no_koma', 'koma4', 'koma5')),
  part text not null check (part in ('first', 'second', 'whole')),
  deadline time not null,
  start_time time not null,
  unique (weekday, condition)
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  student_no text not null unique check (student_no ~ '^[A-Z0-9]{4,12}$'),
  name text not null check (char_length(name) between 1 and 30),
  grade text not null check (grade in ('B1', 'B2', 'B3', 'B4', 'M1', 'M2')),
  gender text not null check (gender in ('male', 'female')),
  status text not null default 'active'
    check (status in ('active', 'retired', 'suspended', 'graduated')),
  role text not null default 'member' check (role in ('member', 'captain', 'vice')),
  approved boolean not null default false,
  retired_on date,
  auth_user_id uuid unique references auth.users (id) on delete set null,
  linked boolean generated always as (auth_user_id is not null) stored,
  registered_at timestamptz not null default now()
);

create table public.koma (
  member_id uuid primary key references public.members (id),
  mon4 boolean not null default false,
  mon5 boolean not null default false,
  tue4 boolean not null default false,
  tue5 boolean not null default false,
  thu4 boolean not null default false,
  thu5 boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  member_id uuid references public.members (id),
  kind text not null check (kind in (
    'day_off', 'no_koma', 'koma4', 'koma5', 'absent_notice', 'late_notice', 'join'
  )),
  memo text not null default '' check (char_length(memo) <= 200),
  contacted_at timestamptz,
  created_by uuid references public.members (id),
  created_at timestamptz not null default now(),
  -- 連絡と参加は個人にだけつく
  check (member_id is not null or kind in ('day_off', 'no_koma', 'koma4', 'koma5'))
);
create index exceptions_date_idx on public.exceptions (date);
create unique index exceptions_join_once on public.exceptions (date, member_id)
  where kind = 'join';

-- 打刻は消さずに、取り消した時刻を入れる
create table public.punches (
  id bigint generated always as identity primary key,
  member_id uuid not null references public.members (id),
  punched_at timestamptz not null,
  practice_date date not null
    generated always as ((punched_at at time zone 'Asia/Tokyo')::date) stored,
  kind text not null check (kind in ('in', 'out', 'auto_out')),
  canceled_at timestamptz,
  distance_m integer,
  via text not null check (via in ('app', 'auto'))
);
create index punches_date_idx on public.punches (practice_date);
create index punches_member_idx on public.punches (member_id, punched_at);

create table public.attendance (
  practice_date date not null,
  member_id uuid not null references public.members (id),
  part text not null check (part in ('first', 'second', 'whole')),
  deadline time not null,
  first_in timestamptz,
  last_out timestamptz,
  minutes integer not null default 0,
  auto_result text not null check (auto_result in (
    'present', 'late', 'late_notified', 'late_notice_overdue', 'absent_unexcused',
    'absent_notified', 'absent_notice_overdue', 'exempt', 'not_arrived', 'unregistered'
  )),
  late_minutes integer,
  manual_result text check (manual_result in (
    'present', 'late', 'late_notified', 'late_notice_overdue', 'absent_unexcused',
    'absent_notified', 'absent_notice_overdue', 'exempt'
  )),
  manual_reason text not null default '' check (char_length(manual_reason) <= 200),
  final_result text not null generated always as (coalesce(manual_result, auto_result)) stored,
  note text not null default '',
  updated_at timestamptz not null default now(),
  primary key (practice_date, member_id)
);

create table public.penalty_types (
  reason text primary key check (char_length(reason) between 1 and 30),
  base_count integer not null check (base_count between 1 and 20),
  assigned_by text not null check (assigned_by in ('auto', 'officer')),
  description text not null default ''
);

-- 残りの数は保存せず、packages/core で計算する
create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  practice_date date not null,
  member_id uuid not null references public.members (id),
  reason text not null references public.penalty_types (reason) on update cascade,
  base_count integer not null check (base_count between 1 and 20),
  memo text not null default '' check (char_length(memo) <= 200),
  created_by uuid references public.members (id),
  auto_key text unique,
  -- 残りが0になった日。未消化なら null
  completed_on date,
  created_at timestamptz not null default now()
);
create index penalties_open_idx on public.penalties (practice_date) where completed_on is null;
create index penalties_member_idx on public.penalties (member_id);

create table public.penalty_tasks (
  id uuid primary key default gen_random_uuid(),
  penalty_id uuid not null references public.penalties (id) on delete cascade,
  content text not null check (char_length(content) between 1 and 60),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.members (id),
  done_at timestamptz,
  done_by uuid references public.members (id)
);
create index penalty_tasks_penalty_idx on public.penalty_tasks (penalty_id);

-- 学年の繰り上げは年度ごとに1回だけ
create table public.grade_promotions (
  fiscal_year integer primary key,
  executed_at timestamptz not null default now(),
  executed_by uuid references public.members (id)
);
