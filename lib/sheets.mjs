/**
 * Google Sheets 認証・ナレッジ取得ヘルパー
 * oc-responder のスプシからメッセージログを読み取り、回答生成の参考にする
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { google } from "googleapis";
import dotenv from "dotenv";

const PROJECT_ROOT = join(dirname(import.meta.url.replace("file://", "")), "..");
dotenv.config({ path: join(PROJECT_ROOT, ".env") });

const SPREADSHEET_ID = process.env.OC_SPREADSHEET_ID;
const TOKENS_PATH =
  process.env.GOOGLE_TOKENS_PATH || join(PROJECT_ROOT, "credentials", "tokens.json");

let _sheets;
async function getSheets() {
  if (_sheets) return _sheets;

  if (!SPREADSHEET_ID) {
    throw new Error("OC_SPREADSHEET_ID が .env に設定されていません");
  }
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET が .env に設定されていません");
  }
  if (!existsSync(TOKENS_PATH)) {
    throw new Error(`トークンファイルが見つかりません: ${TOKENS_PATH}`);
  }

  const tokens = JSON.parse(readFileSync(TOKENS_PATH, "utf-8"));
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  client.setCredentials(tokens);
  _sheets = google.sheets({ version: "v4", auth: client });
  return _sheets;
}

/**
 * スプシから回答済みのQ&Aペアを取得してナレッジベースとして返す
 * D列(メッセージ) + E列(回答案) で、E列が埋まっている行のみ
 */
export async function fetchKnowledge(sheetName) {
  const sheet = sheetName || process.env.DEFAULT_SHEET;
  if (!sheet) throw new Error("シート名が指定されていません");

  const sheets = await getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `'${sheet}'!A2:F`,
  });

  const rows = res.data.values || [];
  const qaPairs = [];

  for (const row of rows) {
    const message = row[3]; // D列: メッセージ
    const answer = row[4];  // E列: 回答案
    if (message && answer) {
      qaPairs.push({ question: message, answer });
    }
  }

  return qaPairs;
}
