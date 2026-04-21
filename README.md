# NoConclusion

Discord 通話向けに、議題ごとの賛否（0〜100）を Firebase Realtime Database でリアルタイム同期する [Next.js](https://nextjs.org) アプリ。ホスティング想定は Vercel。

## 必要なもの

- Node.js 20+
- Firebase プロジェクト（Realtime Database 有効）
- ルーム作成・掃除 API 用のサービスアカウント JSON（サーバー環境変数）

## セットアップ

1. Firebase Console で Realtime Database を作成し、ルート URL を控える。
2. プロジェクト設定から Web アプリ用の設定をコピーする。
3. サービスアカウント JSON を取得し、**1 行の JSON 文字列**として `FIREBASE_SERVICE_ACCOUNT` に渡す（改行は `\n` でエスケープされた `private_key` をそのまま貼る）。
4. ルートに `.env.local` を作り、[`.env.example`](.env.example) を参考に埋める。

```bash
npm install
npm run dev
```

ブラウザで [http://localhost:3000](http://localhost:3000) を開く。

## Realtime Database のルール

[`database.rules.json`](database.rules.json) を Firebase Console の「ルール」に貼り付けて公開する。`createdAt` はクライアントからは書き込めず、サーバー（Admin SDK）のみがルーム作成時に設定する想定。

## Vercel へのデプロイ

1. リポジトリを Vercel にインポートする。
2. Environment Variables に `.env.example` の項目をすべて設定する。
3. `CRON_SECRET` は十分に長いランダム文字列にする。Vercel の Cron が `/api/cron/cleanup` を叩くとき、`Authorization: Bearer <CRON_SECRET>` で検証する。
4. [`vercel.json`](vercel.json) の Cron（毎日 03:00 UTC）が、作成から 7 日を過ぎたルームを削除する。

**注意:** ルーム作成 API は `FIREBASE_SERVICE_ACCOUNT` が無いと 503 を返す。本番では必ず設定すること。

## スクリプト

| コマンド     | 説明           |
| ------------ | -------------- |
| `npm run dev`    | 開発サーバー   |
| `npm run build`  | 本番ビルド     |
| `npm run start`  | 本番サーバー   |
| `npm run lint`   | ESLint         |
