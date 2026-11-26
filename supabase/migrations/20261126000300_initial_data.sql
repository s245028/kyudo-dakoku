-- どの環境にも必要な初期値。入口QRは空にしておき、DB に直接入れる（リポジトリに書かない）。

insert into public.settings (key, value) values
  ('entranceQr', '""'),
  ('dojoLatitude', 'null'),
  ('dojoLongitude', 'null'),
  ('allowedDistanceMeters', '150'),
  ('duplicateScanSeconds', '120'),
  ('undoSeconds', '60'),
  ('autoCheckoutTime', '"22:00"'),
  ('komaLocked', 'false'),
  ('noticeLeadMinutes', '60'),
  ('penaltyDoublingDays', '7');

insert into public.practice_rules (weekday, condition, part, deadline, start_time)
select day.weekday, rule.condition, rule.part, rule.deadline::time, rule.start_time::time
from (values (1), (2), (4)) as day (weekday)
cross join (values
  ('no_koma', 'first', '17:00', '17:30'),
  ('koma4', 'first', '17:30', '17:30'),
  ('koma5', 'second', '19:15', '19:45')
) as rule (condition, part, deadline, start_time);

insert into public.practice_rules (weekday, condition, part, deadline, start_time)
values (6, 'all', 'whole', '08:20', '09:15');

insert into public.penalty_types (reason, base_count, assigned_by, description) values
  ('遅刻', 1, 'auto', '集合時間に遅れて入室し、事前の連絡がない'),
  ('遅刻（連絡遅れ）', 1, 'auto', '遅刻の連絡が締め切りを過ぎていた'),
  ('無断欠席', 1, 'auto', '入室の記録がなく、欠席の連絡もない'),
  ('欠席（連絡遅れ）', 1, 'auto', '欠席の連絡が締め切りを過ぎていた'),
  ('私物の出しっぱなし', 1, 'officer', '道場に私物を置いたままにした'),
  ('その他', 1, 'officer', '上にない罰。メモに内容を書く');
