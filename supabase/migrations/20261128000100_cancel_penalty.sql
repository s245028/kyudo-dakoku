-- つけ間違いの罰の取り消し。記録は残し、残りがないものとして扱う（completed_on も入れる）。
-- 自動の罰は、残った記録があるので、判定し直してもつけ直さない。

alter table public.penalties
  add column canceled_at timestamptz,
  add column canceled_by uuid references public.members (id),
  add constraint penalties_canceled_is_closed
    check (canceled_at is null or completed_on is not null);
