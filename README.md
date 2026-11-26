# 道場打刻（島根大学弓道部）

道場の入口のQRをスマホで読むだけで入室・退室を記録し、遅刻・欠席の判定と罰の管理をするアプリです。

- **現在動いている版**：Google スプレッドシート + Apps Script + GitHub Pages（このリポジトリ直下の `index.html`）。仕組みと運用は `legacy/README.md`。
- **これからの版**：Supabase + Vercel に移行中。計画は `docs/supabase-migration.md`、開発ルールは `AGENTS.md`。

| 場所 | 中身 |
|---|---|
| `index.html` | 現在 GitHub Pages で公開中のアプリ（切り替えが終わるまで残す） |
| `legacy/` | 現行の Apps Script（`Code.gs`）、アプリ、手順書。参照専用 |
| `docs/` | 改修計画 |
| `apps/web/` | 新しいアプリ（Vite + React + TypeScript） |
| `packages/core/` | 業務ロジック（純粋な TypeScript）とテスト |
| `supabase/` | データベースの定義、テスト、Supabase CLI の設定 |

入口QRの中身と印刷用の画像は、このリポジトリに置きません。公開リポジトリなので、値が分かると道場の外から打刻できるおそれがあるためです。現行の値はスプレッドシートの設定シートにあります。

## 開発のセットアップ

必要なもの：Node.js 24、Docker（ローカルの Supabase を動かすとき）。pnpm は Node.js 同梱の Corepack で入ります。

```sh
corepack enable          # 初回だけ。package.json に書いた版の pnpm が使えるようになる
pnpm install
pnpm --filter web dev    # http://localhost:5173
```

| コマンド | 内容 |
|---|---|
| `pnpm test` | 業務ロジックと画面のテスト |
| `pnpm test:db` | データベースのテスト（先に `pnpm exec supabase start`。ローカルのデータは消える） |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | 型チェック |
| `pnpm format` | Prettier で整形 |
| `pnpm check` | CI と同じ確認（整形・lint・型・テスト・ビルド） |

Supabase CLI はリポジトリに含まれるので、別のインストールは不要です。

```sh
pnpm exec supabase start      # ローカルの Supabase を起動
pnpm exec supabase db reset   # マイグレーションと seed を適用し直す
pnpm exec supabase stop
```

設定ファイルは `supabase/config.jsonc` です。

接続済みの開発用プロジェクトには、次のコマンドでマイグレーションを反映します。

```sh
pnpm exec supabase db push --linked
```

`supabase start` が PostgREST のイメージを取得できないときは、`supabase/.temp/rest-version`（接続時に作られるキャッシュ）を削除してから実行します。

## CI と公開

- GitHub Actions（`.github/workflows/ci.yml`）が、プルリクエストと main への反映で `pnpm check` と同じ確認をします。
- Vercel は初回だけ、管理画面の **Add New → Project** でこのリポジトリを取り込みます。**Root Directory はリポジトリ直下のまま**にします（ビルドの設定は `vercel.json` にあります）。以後はプルリクエストごとに確認用URLが出て、main への反映で本番が更新されます。
