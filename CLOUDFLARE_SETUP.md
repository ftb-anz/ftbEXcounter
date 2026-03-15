# Cloudflare Workers + D1 セットアップ

## 1. 前提
- Cloudflareアカウント
- Node.js 18+
- Wrangler CLI

```bash
npm i -g wrangler
```

## 2. D1データベース作成
```bash
wrangler d1 create mnst-excounter-db
```

出力される `database_id` を `wrangler.toml` の `database_id` に設定してください。

## 3. テーブル作成
```bash
wrangler d1 execute mnst-excounter-db --file cloudflare/schema.sql
```

## 4. CORS許可Originを設定
`wrangler.toml` の `ALLOWED_ORIGINS` をGitHub PagesのURLに変更してください。

例:
```toml
ALLOWED_ORIGINS = "https://yourname.github.io"
```

## 5. Workerデプロイ
```bash
wrangler deploy
```

デプロイ後、`https://xxxx.workers.dev` のURLが払い出されます。

## 6. フロント側のAPI URL設定
`index.html` の `window.EXCOUNTER_API_BASE_URL` を、デプロイしたWorker URLへ変更してください。

## 7. GitHub Pagesへ配置
このリポジトリをGitHub Pagesとして公開します。

## 8. 動作確認
- 初回アクセスでUUIDが自動発行される
- サイドバーにUUIDが表示される
- カウント/Undo/Redo後にデータが保持される
- UUID入力で別データへ切り替えられる

## 補足: API呼び出し削減
フロントは保存を約1.2秒デバウンスしており、連続操作を1回の保存にまとめます。
