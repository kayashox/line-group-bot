# line-group-bot — LINE グループチャット Q&A Bot

公式LINEアカウントをグループチャットに参加させ、受講生の質問に Claude API で自動回答するBot。
佐藤 + 受講生 + Bot の3人グループで運用する。

## コマンド一覧

```bash
npm install                          # 依存関係インストール
npm start                            # サーバー起動（本番）
npm run dev                          # サーバー起動（開発・ファイル変更で自動再起動）
node tools/init-spreadsheet.mjs      # 管理スプシを新規作成（初回のみ）
```

## プロジェクト構成

```
line-group-bot/
├── CLAUDE.md                ← このファイル
├── package.json
├── server.mjs               ← メインサーバー（Express + LINE Webhook）
├── lib/
│   ├── ai.mjs              ← Claude API 回答生成
│   └── sheets.mjs          ← Google Sheets 読み書き（3シート対応）
├── tools/
│   └── init-spreadsheet.mjs ← 管理スプシ作成スクリプト
├── credentials/
│   └── tokens.json          ← Google OAuth トークン
├── .env                     ← 環境変数（秘匿）
├── .env.example             ← 環境変数テンプレート
└── .gitignore
```

## スプレッドシート構成

1つのスプレッドシート「line-group-bot 管理」に3シート:

### シート1: `システムプロンプト`
- A1セルにシステムプロンプト全文を格納
- Bot の性格・回答ルール・トーンを定義
- スプシ上で直接編集すれば、コード変更なしで Bot の振る舞いを調整できる
- 5分間キャッシュ

### シート2: `ナレッジ`
- A列: カテゴリ、B列: 質問、C列: 回答
- Bot が回答時に参照するQ&A集
- 手動で追加・編集する運用
- 5分間キャッシュ

### シート3: `会話履歴`
- A列: 日時、B列: グループID、C列: ユーザーID、D列: 発言者、E列: メッセージ
- 全メッセージ（受講生 + Bot）を時系列で記録
- 回答生成時に同じグループの直近10件を参照
- リアルタイム（キャッシュなし）

## アーキテクチャ

```
受講生がグループLINEにメッセージ送信
    ↓
LINE Platform → Webhook → server.mjs
    ↓
handleEvent():
  1. テキストメッセージ + グループチャットのみ処理
  2. 管理者（佐藤さん）のメッセージはスキップ
  3. 管理者宛メンションが含まれるメッセージもスキップ
  4. 「応答生成中...」を即返信（replyToken）
  5. 受講生のメッセージをスプシに記録
  6. スプシから並列取得: システムプロンプト + ナレッジ + 会話履歴
  7. Claude API で回答生成
  8. Bot の回答をスプシに記録
  9. 本回答を push message でグループに送信
```

## Bot の動作ルール

| 状況 | Bot の動作 |
|------|----------|
| 受講生がメッセージを送る | 自動回答する |
| 佐藤さんがメッセージを送る | 無視する |
| 受講生が佐藤さん宛にメンション | 無視する（佐藤さんに任せる） |
| テキスト以外（画像・スタンプ等） | 無視する |
| 1対1トーク | 無視する（グループのみ） |

## 環境変数

```
LINE_CHANNEL_ACCESS_TOKEN    # LINE Messaging API チャンネルアクセストークン
LINE_CHANNEL_SECRET          # LINE Messaging API チャンネルシークレット
ANTHROPIC_API_KEY            # Claude API キー
GOOGLE_CLIENT_ID             # Google OAuth クライアントID
GOOGLE_CLIENT_SECRET         # Google OAuth クライアントシークレット
SPREADSHEET_ID               # line-group-bot 管理スプレッドシートID
ADMIN_USER_ID                # 管理者の LINE ユーザーID（スキップ対象）
PORT                         # サーバーポート（デフォルト: 3000）
```

## デプロイ（Render.com）

1. Render.com で新しい Web Service を作成
2. ビルドコマンド: `npm install`
3. スタートコマンド: `npm start`
4. 環境変数を全て設定
5. デプロイ後、URL をコピー
6. LINE Developers Console → Messaging API設定 → Webhook URL に `https://<render-url>/webhook` を設定
7. Webhook を「利用する」に変更
8. 「応答メッセージ」を「オフ」に変更（LINE Official Account Manager で設定）

## ADMIN_USER_ID の取得方法

Bot をグループに入れた後、佐藤さんがグループでメッセージを送ると、
サーバーログに `[message] group=... user=Uxxxx...` と表示される。
この `user=` の値が佐藤さんの LINE ユーザーID。
`.env` の `ADMIN_USER_ID` にセットする。

## よくあるエラーと対処法

| エラー | 原因 | 対応 |
|--------|------|------|
| `Invalid signature` | チャンネルシークレットが違う | .env の LINE_CHANNEL_SECRET を確認 |
| `Invalid reply token` | replyToken の期限切れ（30秒） | 処理を高速化する |
| `SPREADSHEET_ID が未設定` | .env にスプシIDがない | .env を確認 |
| `トークンファイルが見つかりません` | Google認証未設定 | credentials/tokens.json を確認 |
