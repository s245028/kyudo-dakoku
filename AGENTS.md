# AGENTS.md — 道場打刻システムの開発ルール

島根大学弓道部の打刻・出欠・罰管理アプリです。Codex・Claude CLI などのエージェントも、人も、このルールに従って開発します。

## まず読むもの
1. `docs/supabase-migration.md` — 改修計画（業務ルール、データモデル、フェーズ、受け入れテスト）
2. `legacy/Code.gs` — 現行の実装。**業務ルールの正解**。挙動を変える場合は、計画書かプルリクエストにその判断を明記する
3. `README.md` — セットアップと運用手順

## 技術構成
- アプリ：Vite + React + TypeScript（PWA）、Vercel で公開
- バックエンド：Supabase（Postgres、匿名ログイン、RLS、Edge Functions、Realtime、pg_cron）
- 業務ロジック：`packages/core`（純粋な TypeScript）。テストは Vitest
- パッケージ管理：pnpm workspaces

## 設計の原則
- **業務ロジックは `packages/core` に置く。** 判定・遅刻の分数・連絡の締め切り・罰の残りの数・参加登録の可否などは、DB や画面に触れない関数にする。画面のコンポーネントや Edge Functions に同じ計算を書かない。
- **書き込みは Edge Functions を通す。** アプリから表を直接書き換えない。権限（状態・承認・役職）はサーバー側で毎回確認する。
- **日本時間で考える。** 練習日は Asia/Tokyo の日付。時刻の比較は core のヘルパーを使い、`new Date()` を各所で直接比べない。
- **責務ごとに分ける。** 1ファイルが大きくなったら、概念（打刻・判定・罰・部員・設定）ごとに分割する。抽象化しすぎない。
- **名前で意味が分かるようにする。** コード上の名前は英語、画面の文言は自然な日本語。業務用語の対応は下の用語表に合わせる。
- **マジックナンバーを書かない。** 秒数・分数・日数は設定（`settings` テーブル）か、名前のついた定数にする。
- **CSS はファイルに書く。** インラインスタイル、1行に詰めた CSS、使っていないコード、重複は残さない。
- **既存の挙動・画面・API・DB を守る。** リファクタリングは小さく段階的に。挙動を変えるときは理由を残す。

## 用語表（画面の日本語 ↔ コード）
| 画面 | コード |
|---|---|
| 部員／状態（現役・引退・休部・退部・卒業） | member / status (`active` `retired` `suspended` `graduated`) |
| 役職（部員・主将・男子副将・女子副将・主務・副務・会計・管理者） | role (`member` `captain` `men_vice_captain` `women_vice_captain` `chief_manager` `vice` `treasurer` `admin`) |
| 打刻（入室・退室・自動退室） | punch (`in` `out` `auto_out`) |
| 練習ルール／区分（前半・後半・全体）／集合時刻 | practice rule / part / deadline |
| コマ表（4コマ・5コマ） | koma |
| 臨時変更（休み・4・5コマなし・4コマあり・5コマあり・欠席連絡済・遅刻連絡済・参加） | exception (`day_off` `no_koma` `koma4` `koma5` `absent_notice` `late_notice` `join`) |
| 出欠一覧／自動判定／手動判定／最終判定 | attendance / auto_result / manual_result / final_result |
| 罰／基本の数／残りの数 | penalty / base_count / remaining |
| やること（罰1個ぶん）／消化 | penalty task / complete |
| 代替わり／学年の繰り上げ | generation change / grade promotion |

## テスト
- `packages/core` の関数を変えたら、必ずテストを足すか直す。`docs/supabase-migration.md` の10章（受け入れテスト）はすべてテストにする。
- 判定・罰のルールを変えたときは、計画書の2章も更新する。
- RLS は「他人のコマ表が読めない」「部員が表を直接書き換えられない」をテストする。

## コマンド
```
pnpm install
pnpm test          # 業務ロジックと画面のテスト
pnpm test:db       # データベースのテスト（ローカルの Supabase が必要）
pnpm lint
pnpm check         # CI と同じ確認
pnpm --filter web dev
pnpm exec supabase start     # ローカルの Supabase
pnpm exec supabase db reset  # マイグレーションと seed を適用し直す
```

## やってはいけないこと
- `legacy/` を編集する（参照専用）。
- 本番の Supabase プロジェクトに直接マイグレーションを流す（開発用プロジェクトで確認してから）。
- service role キーや個人情報（名簿・打刻データ）をリポジトリやログに残す。
- 入口QRの中身を変える。印刷して道場に貼ってある。
- 入口QRの中身（値や画像）をリポジトリやログに残す。このリポジトリは公開されている。

## 完了の条件
- テストと lint が通る。
- Vercel の確認用URLで、変更した画面をスマホ幅で確認した。
- 業務ルールに関わる変更なら、計画書と README を更新した。
- プルリクエストに「何を・なぜ変えたか」「確認した手順」を書いた。
