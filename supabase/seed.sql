-- ローカルの Supabase だけに入れる値。本番や開発用のプロジェクトには流さない。
update public.settings set value = '"LOCAL-TEST-QR"' where key = 'entranceQr';
