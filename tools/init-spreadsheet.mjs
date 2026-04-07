/**
 * スプレッドシート「line-group-bot 管理」を新規作成し、3シートを構成する
 * 実行: node tools/init-spreadsheet.mjs
 */

import { readFileSync, existsSync, writeFileSync, readFileSync as readFile } from "fs";
import { join, dirname } from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

const PROJECT_ROOT = join(dirname(import.meta.url.replace("file://", "")), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const TOKENS_PATH = process.env.GOOGLE_TOKENS_PATH || join(PROJECT_ROOT, "credentials", "tokens.json");

async function main() {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が .env に設定されていません");
    process.exit(1);
  }
  if (!existsSync(TOKENS_PATH)) {
    console.error(`トークンファイルが見つかりません: ${TOKENS_PATH}`);
    process.exit(1);
  }

  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  auth.setCredentials(tokens);

  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  console.log("スプレッドシートを作成中...");

  const res = await sheets.spreadsheets.create({
    requestBody: {
      properties: { title: "line-group-bot 管理" },
      sheets: [
        {
          properties: { title: "システムプロンプト", index: 0 },
        },
        {
          properties: { title: "ナレッジ", index: 1 },
        },
        {
          properties: { title: "会話履歴", index: 2 },
        },
      ],
    },
  });

  const spreadsheetId = res.data.spreadsheetId;
  const url = res.data.spreadsheetUrl;
  console.log(`作成完了: ${url}`);
  console.log(`スプレッドシートID: ${spreadsheetId}`);

  // --- シート1: システムプロンプト（A1に全文） ---
  const systemPrompt = `あなたは Claude Code ブートキャンプのサポートBotです。
LINEグループチャットで受講生からの質問に答えます。

## 心構え

受講生は初心者がほとんど。
「初めてのことに挑戦している人」に対して、先輩が隣で一緒に画面を見ながら教えるような温度感で回答する。
短く済ませようとしない。長文OK、丁寧すぎるくらいでちょうどいい。

## トーン

- 敬語ベースだけど堅すぎない。「〜してください」より「〜してみてください！」
- 相手の困りごとや頑張りに共感を示す。「ここ詰まりますよね」「ナイスです！」など
- 感情を込める。句読点だけでなく「！」や絵文字も適度に使う
- 「分からなくて当然」「よくある質問です」など、安心させる言葉を入れる

## 回答の構成

### 質問・エラー報告への回答:
1. 共感・ねぎらい: 相手の状況に寄り添う一文
2. 結論を先に: 質問への直接的な答え
3. 具体的な手順: どこをクリックするか・何を入力するかを細かく書く
4. 補足・注意点: ハマりやすいポイントや関連情報
5. 締め: 「うまくいかなかったらまた聞いてください！」など、次のアクションを促す

### 進捗報告・決意表明へのリアクション:
1. 挨拶
2. 相手の行動・姿勢を具体的に褒める
3. 安心させる: 自分のペースでOK、いつでも聞いてOK
4. 応援の締め

### 挨拶・自己紹介へのリアクション:
1. 歓迎: 「ようこそ！」「よろしくお願いします！」
2. 安心させる: 初心者でも大丈夫、みんな同じスタートライン
3. 次のアクションを軽く促す

## 絶対にやらないこと

- UIの具体的な操作方法を断言しない: ショートカットキーやボタンの位置をAIが断言すると、バージョン違いやOS違いで嘘になる
- 確信のない情報を書かない: 料金、URL、設定手順など、変わりやすい情報は「最新情報は公式サイトで確認してください」と添える
- 知らないことを推測で答えない: 分からなければ「確認して回答しますね！」と保留する

## 重要

- LINEのメッセージなので、改行を活用して読みやすくする
- マークダウン記法（**太字**、\`コード\`など）はLINEでは表示されないので使わない
- 1回の返答は500文字程度を目安にする。長すぎるとLINEでは読みづらい`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'システムプロンプト'!A1",
    valueInputOption: "RAW",
    requestBody: { values: [[systemPrompt]] },
  });
  console.log("シート「システムプロンプト」にデータを書き込みました");

  // --- シート2: ナレッジ（ヘッダー行のみ） ---
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'ナレッジ'!A1:C1",
    valueInputOption: "RAW",
    requestBody: { values: [["カテゴリ", "質問", "回答"]] },
  });
  console.log("シート「ナレッジ」にヘッダーを書き込みました");

  // --- シート3: 会話履歴（ヘッダー行のみ） ---
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: "'会話履歴'!A1:E1",
    valueInputOption: "RAW",
    requestBody: { values: [["日時", "グループID", "ユーザーID", "発言者", "メッセージ"]] },
  });
  console.log("シート「会話履歴」にヘッダーを書き込みました");

  // --- .env に SPREADSHEET_ID を書き込み ---
  const envPath = join(PROJECT_ROOT, ".env");
  let envContent = readFile(envPath, "utf-8");
  if (envContent.includes("SPREADSHEET_ID=")) {
    envContent = envContent.replace(/SPREADSHEET_ID=.*/, `SPREADSHEET_ID=${spreadsheetId}`);
  } else {
    envContent += `\nSPREADSHEET_ID=${spreadsheetId}\n`;
  }
  writeFileSync(envPath, envContent);
  console.log(`.env に SPREADSHEET_ID を保存しました`);

  console.log("\n--- 完了 ---");
  console.log(`スプレッドシートURL: ${url}`);
  console.log(`SPREADSHEET_ID=${spreadsheetId}`);
  console.log("\nRender.com の環境変数にも SPREADSHEET_ID を追加してください。");
}

main().catch((err) => {
  console.error("エラー:", err.message);
  process.exit(1);
});
